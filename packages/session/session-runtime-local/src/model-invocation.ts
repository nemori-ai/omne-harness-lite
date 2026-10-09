import {
  StorageDefect,
  StorageUnavailable,
  narrow,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { readJsonStrict, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  checkSourceToken,
  checkKey,
  positiveInteger,
  object,
  compareInteger,
  type SessionLogParticipant,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  OriginalIssueIdentity,
  OriginalIssueAuthority,
  OriginalIssueParticipant,
  OriginalIssueStage,
  OriginalIssueTicket,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RuntimeOptions, LocalSessionIngress, SessionLifecycleStep } from './runtime-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type { createLocalSessionState } from './state-participant.ts'
import {
  lifecycleInput,
  usableSource,
  CoordinationRejection,
  boundedText,
} from './coordination-values.ts'
import { InvalidStateInput, positionText } from './state-values.ts'
import { verifyCallPreparation } from './call-preparation.ts'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
interface Host {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly state: ReturnType<typeof createLocalSessionState>
  readonly log: SessionLogParticipant
  readonly isOpen: () => boolean
}
export interface StoredModelIssue {
  readonly identity: OriginalIssueIdentity
  readonly source: SourceToken
  readonly preparation: string
}
type Issue = StoredModelIssue
interface Database {
  sr_model_issue: {
    session: string
    call: string
    dispatch: string
    source_generation: string
    source_tail: string
    issue: string
  }
}
export function createSessionModelAdmission(host: Host): LocalSessionIngress['modelInvocation'] {
  const owned = new ModelAdmission(host)
  return Object.freeze({ admit: owned.admit })
}
class ModelAdmission {
  readonly active = new WeakMap<StorageUnit, { scope: SessionScope; step: Preparation }>()
  readonly permits = new Map<string, Preparation>()
  readonly participant: OriginalIssueParticipant | undefined
  constructor(readonly host: Host) {
    const config = host.options.modelIssue
    this.participant = config?.create({
      log: this.originalLog(),
      access: host.authority.logAccess,
      authority: { authorizeIn: this.authorizeIn },
    })
  }
  originalLog(): SessionLogParticipant {
    const log = this.host.log
    return Object.freeze<SessionLogParticipant>({
      ...log,
      readPrefix: async (access, requested) => {
        if (access !== this.host.authority.logAccess) return { failure: 'denied' }
        const checked = checkSourceToken(requested)
        if ('failure' in checked) return checked
        const source = checked.ok
        if (!tenantIdEquals(source.tenant, this.host.options.tenant)) return { failure: 'denied' }
        return this.host.options.storage.atomic(unit =>
          unit.run(async () => {
            const row = await unit.query(tx =>
              narrow<Database>(tx)
                .selectFrom('sr_model_issue')
                .select('issue')
                .where('session', '=', source.session)
                .where('source_generation', '=', source.journalGeneration)
                .where('source_tail', '=', this.number(source.tail))
                .executeTakeFirst(),
            )
            if (!row) return { failure: 'denied' as const }
            const issue = this.decode(row.issue)
            if (!sameSource(issue.source, source))
              throw new StorageDefect('original model source index mismatch')
            return this.host.authority.withinOriginalRead(unit, source, () =>
              log.readPrefixIn(unit, access, source),
            )
          }),
        )
      },
    })
  }
  authorizeIn: OriginalIssueAuthority['authorizeIn'] = async (unit, identity) => {
    unit.assertStorage(this.host.options.storage)
    if (!this.host.isOpen()) return { kind: 'unavailable' }
    const active = this.active.get(unit)
    if (active) return this.authorize(unit, active.scope, active.step, identity)
    const row = await this.issue(unit, identity)
    if (!row || !sameIdentity(row.identity, identity)) return { kind: 'denied' }
    const step = this.permits.get(this.key(identity))
    if (!step) return { kind: 'unavailable' }
    const scope = { tenant: identity.tenant, session: identity.session }
    return this.host.authority.withinRun(unit, scope, step.run, () =>
      this.authorize(unit, scope, step, identity),
    )
  }
  async authorize(
    unit: StorageUnit,
    scope: SessionScope,
    step: Preparation,
    identity: OriginalIssueIdentity,
  ) {
    if (!matches(scope, step, identity)) return { kind: 'denied' as const }
    if (!(await this.host.state.checkPermitIn(unit, step.permit, scope, step.run, step.attempt)))
      return { kind: 'staleAttempt' as const }
    return this.host.options.modelIssue!.current.authorizeIn(unit, identity)
  }
  admit: LocalSessionIngress['modelInvocation']['admit'] = async (
    authority,
    scope,
    source,
    requested,
    ticket,
  ) => {
    if (authority !== this.host.authority.coordination) return { failure: 'denied' }
    if (!this.participant) return { failure: 'unavailable' }
    const progress = { stagingStarted: false }
    try {
      const input = lifecycleInput(
        scope,
        source,
        requested,
        this.host.options.policy.maxRecordBytes,
      )
      if (input.step.kind !== 'prepareCall') return { failure: 'invalidInput' }
      if (!tenantIdEquals(input.scope.tenant, this.host.options.tenant))
        return { failure: 'denied' }
      const step = input.step
      const result = await this.host.options.storage.atomic(unit =>
        unit.run(() =>
          this.host.authority.withinRun(unit, input.scope, step.run, () =>
            this.stageIn(unit, input.scope, input.source, step, ticket, progress),
          ),
        ),
      )
      if ('kind' in result && result.kind === 'issued')
        this.permits.set(this.key(result.identity), step)
      return result
    } catch (error) {
      return admissionFailure(error, scope, requested, progress.stagingStarted)
    }
  }
  async sourceIn(unit: StorageUnit, scope: SessionScope): Promise<SourceToken> {
    const source = await this.host.log.sourceIn(unit, this.host.authority.logAccess, scope)
    if ('failure' in source) throw new CoordinationRejection(source.failure)
    return source.source
  }
  async stageIn(
    unit: StorageUnit,
    scope: SessionScope,
    expected: SourceToken,
    step: Preparation,
    ticket: OriginalIssueTicket,
    progress: { stagingStarted: boolean },
  ) {
    const current = await this.sourceIn(unit, scope)
    usableSource(current, expected)
    await verifyCallPreparation(unit, scope, step, current, this.host.options)
    if (!(await this.host.state.checkPermitIn(unit, step.permit, scope, step.run, step.attempt)))
      return { failure: 'staleAttempt' as const }
    this.active.set(unit, { scope, step })
    let staged: OriginalIssueStage
    try {
      progress.stagingStarted = true
      staged = await this.participant!.stageOriginalIn(unit, ticket)
    } finally {
      this.active.delete(unit)
    }
    return this.adoptOriginal(unit, scope, step, staged)
  }
  async adoptOriginal(
    unit: StorageUnit,
    scope: SessionScope,
    step: Preparation,
    staged: OriginalIssueStage,
  ) {
    if (staged.kind !== 'staged' && staged.kind !== 'alreadyIssued') throwStage(staged)
    if (!matches(scope, step, staged.identity))
      throw new StorageDefect('original model participant changed prepared identity')
    if (staged.kind === 'alreadyIssued') {
      const known = await this.issue(unit, staged.identity)
      if (!known || !sameIdentity(known.identity, staged.identity))
        throw new StorageDefect('model claim missing Session issue proof')
      return staged
    }
    await this.save(unit, staged, step, await this.sourceIn(unit, scope))
    return {
      kind: 'issued' as const,
      identity: staged.identity,
      positions: staged.positions,
      claim: staged.claim,
    }
  }
  async save(
    unit: StorageUnit,
    staged: Extract<OriginalIssueStage, { kind: 'staged' }>,
    step: Preparation,
    source: SourceToken,
  ) {
    if (!staged.positions.length || compareInteger(staged.positions.at(-1)!, source.tail) !== 0)
      throw new StorageDefect('model issue positions do not end at staged source')
    const count = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_model_issue')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    )
    if (Number(count.n) >= this.host.options.modelIssue!.maxRecords)
      throw new CoordinationRejection('unavailable')
    const issue: Issue = { identity: staged.identity, source, preparation: step.originalPosition }
    await unit.mutate(tx =>
      narrow<Database>(tx)
        .insertInto('sr_model_issue')
        .values({
          session: source.session,
          call: staged.identity.call,
          dispatch: this.number(staged.identity.dispatch),
          source_generation: source.journalGeneration,
          source_tail: this.number(source.tail),
          issue: boundedText(issue, this.host.options.policy.maxRecordBytes),
        })
        .execute(),
    )
  }
  async issue(unit: StorageUnit, identity: OriginalIssueIdentity): Promise<Issue | undefined> {
    const row = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_model_issue')
        .select('issue')
        .where('session', '=', identity.session)
        .where('call', '=', identity.call)
        .where('dispatch', '=', this.number(identity.dispatch))
        .executeTakeFirst(),
    )
    return row ? this.decode(row.issue) : undefined
  }
  decode(text: string): Issue {
    return decodeStoredModelIssue(text, this.host.options.policy.maxRecordBytes)
  }
  number(value: OriginalIssueIdentity['dispatch']) {
    return positionText(value, this.host.options.policy.maxRecordBytes)
  }
  key(identity: OriginalIssueIdentity) {
    return JSON.stringify([
      identity.session,
      identity.call,
      this.number(identity.dispatch),
      identity.executionGeneration,
    ])
  }
}
export function decodeStoredModelIssue(text: string, limit: number): StoredModelIssue {
  const value = issueEnvelope(text, limit)
  const identity = checkedIdentity(value.identity)
  const source = checkSourceToken(value.source)
  if (
    'failure' in source ||
    !tenantIdEquals(identity.tenant, source.ok.tenant) ||
    identity.session !== source.ok.session
  )
    throw new StorageDefect('corrupt original model issue source')
  return { identity, source: source.ok, preparation: value.preparation as string }
}
function matches(scope: SessionScope, step: Preparation, identity: OriginalIssueIdentity): boolean {
  return (
    tenantIdEquals(scope.tenant, identity.tenant) &&
    scope.session === identity.session &&
    step.call === identity.call &&
    step.run === identity.run &&
    identity.attempt !== undefined &&
    compareInteger(step.attempt, identity.attempt) === 0
  )
}
function sameSource(a: SourceToken, b: SourceToken): boolean {
  return (
    tenantIdEquals(a.tenant, b.tenant) &&
    a.session === b.session &&
    a.journalGeneration === b.journalGeneration &&
    compareInteger(a.tail, b.tail) === 0
  )
}
function sameIdentity(a: OriginalIssueIdentity, b: OriginalIssueIdentity): boolean {
  return (
    tenantIdEquals(a.tenant, b.tenant) &&
    a.session === b.session &&
    a.executionGeneration === b.executionGeneration &&
    compareInteger(a.dispatch, b.dispatch) === 0 &&
    a.originalPosition === b.originalPosition &&
    a.run === b.run &&
    a.attempt !== undefined &&
    b.attempt !== undefined &&
    compareInteger(a.attempt, b.attempt) === 0 &&
    a.call === b.call
  )
}
function throwStage(
  stage: Extract<
    OriginalIssueStage,
    { kind: 'invalidInput' | 'denied' | 'staleAttempt' | 'unavailable' | 'conflict' }
  >,
): never {
  throw new CoordinationRejection(stage.kind === 'conflict' ? 'retryFromFacts' : stage.kind)
}

function admissionFailure(
  error: unknown,
  scope: SessionScope,
  step: Preparation,
  started: boolean,
) {
  if (error instanceof StorageUnavailable)
    return started
      ? {
          kind: 'unknownCommit' as const,
          scope,
          call: step.call,
          originalPosition: step.originalPosition,
        }
      : { failure: 'unavailable' as const }
  if (error instanceof InvalidStateInput) return { failure: 'invalidInput' as const }
  if (error instanceof CoordinationRejection) return { failure: error.failure }
  throw error
}
function issueEnvelope(text: string, limit: number): JsonObject {
  if (Buffer.byteLength(text) > limit) throw new StorageDefect('oversized Session model issue')
  const result = readJsonStrict(text)
  if (
    !('ok' in result) ||
    !object(result.ok) ||
    Object.keys(result.ok).length !== 3 ||
    !checkKey(result.ok.preparation) ||
    result.ok.identity === undefined ||
    !object(result.ok.identity)
  )
    throw new StorageDefect('corrupt Session model issue')
  return result.ok
}
function checkedIdentity(value: JsonValue | undefined): OriginalIssueIdentity {
  if (value === undefined || !object(value))
    throw new StorageDefect('corrupt original model identity')
  const keys = [
    'tenant',
    'session',
    'call',
    'dispatch',
    'run',
    'attempt',
    'executionGeneration',
    'originalPosition',
  ]
  if (Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k)))
    throw new StorageDefect('corrupt original model identity')
  if (!identityFieldsValid(value)) throw new StorageDefect('corrupt original model identity fields')
  const checked = checkSourceToken({
    tenant: value.tenant,
    session: value.session,
    journalGeneration: value.executionGeneration,
    tail: value.dispatch,
  })
  if ('failure' in checked) throw new StorageDefect('corrupt original model identity scope')
  return {
    ...value,
    tenant: checked.ok.tenant,
    session: checked.ok.session,
  } as unknown as OriginalIssueIdentity
}
function identityFieldsValid(value: JsonObject): boolean {
  return (
    checkKey(value.call) &&
    checkKey(value.run) &&
    checkKey(value.originalPosition) &&
    positiveInteger(value.dispatch) &&
    positiveInteger(value.attempt)
  )
}
