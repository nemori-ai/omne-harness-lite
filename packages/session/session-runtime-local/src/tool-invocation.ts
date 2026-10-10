import { inspectToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import {
  compareInteger,
  type JsonNumber,
  type SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import type {
  ToolOriginalIssueStage,
  ToolOriginalIssueSupport,
  ToolOriginalIssueIdentity,
  ToolOriginalIssueClaim,
  ToolOriginalIssueParticipant,
  ToolOriginalIssueFailure,
} from '@omne-harness-lite/tool-execution-runtime'
import type { RuntimeOptions, SessionLifecycleStep } from './runtime-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type { createLocalSessionState } from './state-participant.ts'
import { CoordinationRejection } from './coordination-values.ts'
import { runtimeSemantic } from './runtime-values.ts'
import { verifyCallPreparation } from './call-preparation.ts'
import { createToolRecordAppender } from './tool-record-append.ts'
import { readDriverRunState } from './run-history.ts'
import { hasOriginalToolFailure } from './tool-request-proof.ts'
import { readSessionToolOriginalIn } from './tool-original-read.ts'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
interface Held {
  readonly scope: SessionScope
  readonly step: Preparation
  readonly participant: ToolOriginalIssueParticipant
}
interface Row {
  session: string
  call: string
  identity: string
  original: string | null
  preparation: string
}
interface Database {
  sr_tool_issue: Row
}
interface Host {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly state: ReturnType<typeof createLocalSessionState>
  readonly log: SessionLogParticipant
  readonly isOpen: () => boolean
}
export function createSessionToolAdmission(host: Host) {
  const preparations = new Map<string, { scope: SessionScope; step: Preparation }>()
  const claims = new WeakMap<ToolOriginalIssueClaim, Held>()
  const active = new WeakMap<StorageUnit, Held>()
  const tasks = new Set<Promise<unknown>>()
  const key = (scope: SessionScope, call: string) =>
    JSON.stringify([scope.tenant.organization, scope.tenant.account, scope.session, call])
  const text = (value: unknown) => runtimeSemantic(value, host.options.policy.maxRecordBytes)
  function track<T>(work: () => Promise<T>) {
    if (!host.isOpen() || tasks.size >= host.options.policy.maxInFlight)
      return Promise.resolve({ kind: 'unavailable' } as const)
    const task = Promise.resolve().then(work)
    tasks.add(task)
    void task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    )
    return task
  }
  function find(unit: StorageUnit, identity: ToolOriginalIssueIdentity) {
    return unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_tool_issue')
        .selectAll()
        .where('session', '=', identity.ref.session)
        .where('call', '=', identity.ref.callId)
        .executeTakeFirst(),
    )
  }
  async function check(unit: StorageUnit, held: Held) {
    if (!host.isOpen()) return { kind: 'closed' } as const
    const { scope, step, participant } = held,
      identity = participant.identity
    if (!matches(scope, step, identity)) return { kind: 'denied' } as const
    if (!(await host.state.checkPermitIn(unit, step.permit, scope, step.run, step.attempt)))
      return { kind: 'staleAttempt' } as const
    const result = await host.options.toolIssue!.current.authorizeIn(unit, identity)
    return host.isOpen() ? result : ({ kind: 'closed' } as const)
  }
  async function withOriginalRead<T>(
    unit: StorageUnit,
    scope: SessionScope,
    read: () => Promise<T>,
    denied: T,
  ): Promise<T> {
    unit.assertStorage(host.options.storage)
    if (active.has(unit)) return read()
    if (!tenantIdEquals(scope.tenant, host.options.tenant)) return denied
    const row = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_tool_issue')
        .select('call')
        .where('session', '=', scope.session)
        .executeTakeFirst(),
    )
    if (!row) return denied
    return host.authority.withinOriginalRead(unit, scope, read)
  }
  const log = Object.freeze<ToolOriginalIssueSupport['log']>({
    appendIn: createToolRecordAppender({
      ...host,
      activeIn: unit => active.get(unit)?.participant.identity,
      original: (unit, ref) => readSessionToolOriginalIn(unit, host.options, ref),
    }),
    sourceIn: (unit, access, scope) =>
      access !== host.authority.logAccess
        ? Promise.resolve({ failure: 'denied' } as const)
        : withOriginalRead(unit, scope, () => host.log.sourceIn(unit, access, scope), {
            failure: 'denied',
          } as const),
    readByKeyIn: (unit, access, source, key) =>
      access !== host.authority.logAccess
        ? Promise.resolve({ failure: 'denied' } as const)
        : withOriginalRead(unit, source, () => host.log.readByKeyIn(unit, access, source, key), {
            failure: 'denied',
          } as const),
  })
  async function admit(participant: ToolOriginalIssueParticipant) {
    const identity = participant.identity,
      scope = { tenant: identity.ref.tenant, session: identity.ref.session }
    if (!host.isOpen()) return { kind: 'closed' } as const
    if (!tenantIdEquals(scope.tenant, host.options.tenant)) return { kind: 'denied' } as const
    const prepared = preparations.get(key(scope, identity.ref.callId))
    if (!prepared || !matches(prepared.scope, prepared.step, identity))
      return { kind: 'denied' } as const
    const held: Held = { ...prepared, participant }
    const progress = { started: false }
    try {
      return await host.options.storage.atomic(unit =>
        host.authority.withinRun(unit, scope, held.step.run, async () => {
          return stageIn(unit, held, progress)
        }),
      )
    } catch (error) {
      return failure(error, identity, progress.started)
    }
  }
  async function stageIn(unit: StorageUnit, held: Held, progress: { started: boolean }) {
    const { scope, participant } = held,
      identity = participant.identity
    const allowed = await check(unit, held)
    if (allowed.kind !== 'authorized') return allowed
    const source = await host.log.sourceIn(unit, host.authority.logAccess, scope)
    if ('failure' in source) throw new CoordinationRejection(source.failure)
    await verifyCallPreparation(unit, scope, held.step, source.source, host.options)
    active.set(unit, held)
    try {
      progress.started = true
      const staged = await participant.stageOriginalIn(unit)
      if (staged.kind !== 'staged' && staged.kind !== 'alreadyIssued')
        throw new ToolStageFailure(staged)
      if (text(staged.identity) !== text(identity))
        throw new StorageDefect('Tool participant changed original identity')
      await verifyIssuedIn(unit, held, staged)
      const existing = await find(unit, identity)
      if (staged.kind === 'alreadyIssued') {
        if (!existing || existing.identity !== text(identity))
          throw new StorageDefect('Tool original lacks Session proof')
        return staged
      }
      if (existing) throw new StorageDefect('Tool staged twice for an existing Session proof')
      await save(unit, held)
      claims.set(staged.claim, held)
      return { ...staged, kind: 'issued' as const }
    } finally {
      active.delete(unit)
    }
  }
  async function verifyIssuedIn(
    unit: StorageUnit,
    held: Held,
    issued: Extract<ToolOriginalIssueStage, { kind: 'staged' | 'alreadyIssued' }>,
  ) {
    const source = await host.log.sourceIn(unit, host.authority.logAccess, held.scope)
    if ('failure' in source) throw new CoordinationRejection(source.failure)
    verifyIssuedTail(issued, source.source.tail)
    const prefix = await host.log.readPrefixIn(unit, host.authority.logAccess, source.source)
    if ('failure' in prefix) throw new CoordinationRejection(prefix.failure)
    const identity = held.participant.identity
    const entry = prefix.entries.find(entry => entry.dedupeKey === identity.originalPosition)
    if (!entry) throw new StorageDefect('Tool issue lacks original intent')
    const inspected = inspectToolJournalEntry(held.scope, entry, host.options.parameters)
    if (!('value' in inspected) || inspected.value.kind !== 'execution_intended')
      throw new StorageDefect('Tool issue original position is not an intent')
    if (
      text(inspected.value.ref) !== text(identity.ref) ||
      text(inspected.value.origin) !== text(identity.origin)
    )
      throw new StorageDefect('Tool issue original intent identity mismatch')
    if (
      !hasOriginalToolFailure(
        {
          scope: held.scope,
          entries: prefix.entries,
          ownerGeneration: source.source.journalGeneration,
          tail: source.source.tail,
        },
        inspected.value,
      )
    )
      throw new ToolStageFailure({ kind: 'conflict' })
  }
  async function save(unit: StorageUnit, held: Held) {
    const count = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_tool_issue')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    )
    if (Number(count.n) >= host.options.toolIssue!.maxRecords)
      throw new ToolStageFailure({ kind: 'unavailable' })
    const { permit: _permit, ...data } = held.step
    await unit.mutate(tx =>
      narrow<Database>(tx)
        .insertInto('sr_tool_issue')
        .values({
          session: held.scope.session,
          call: held.participant.identity.ref.callId,
          identity: text(held.participant.identity),
          original: writeJsonLossless(held.participant.identity),
          preparation: text(data),
        })
        .execute(),
    )
  }
  async function consume(claim: ToolOriginalIssueClaim) {
    const held = claims.get(claim)
    if (!held) return { kind: 'invalidInput' } as const
    const identity = held.participant.identity
    if (!host.isOpen()) return { kind: 'closed' } as const
    const progress = { started: false }
    try {
      return await host.options.storage.atomic(unit =>
        host.authority.withinRun(unit, held.scope, held.step.run, async () => {
          return consumeIn(unit, held, claim, progress)
        }),
      )
    } catch (error) {
      return failure(error, identity, progress.started)
    }
  }
  async function consumeIn(
    unit: StorageUnit,
    held: Held,
    claim: ToolOriginalIssueClaim,
    progress: { started: boolean },
  ) {
    const identity = held.participant.identity
    const allowed = await check(unit, held)
    if (allowed.kind !== 'authorized') return allowed
    const proof = await find(unit, identity)
    const { permit: _permit, ...prepared } = held.step
    if (!proof || proof.identity !== text(identity) || proof.preparation !== text(prepared))
      return { kind: 'denied' } as const
    const source = await host.log.sourceIn(unit, host.authority.logAccess, held.scope)
    if ('failure' in source) throw new CoordinationRejection(source.failure)
    await verifyCallPreparation(unit, held.scope, held.step, source.source, host.options)
    active.set(unit, held)
    try {
      progress.started = true
      const result = await held.participant.consumeOriginalIn(unit, claim)
      if (result.kind === 'staged') {
        if (text(result.identity) !== text(identity))
          throw new StorageDefect('Tool consumption changed original identity')
        return { ...result, kind: 'launch' as const }
      }
      return result
    } finally {
      active.delete(unit)
    }
  }
  async function terminalClassificationIn(
    unit: StorageUnit,
    scope: SessionScope,
    identity: ToolOriginalIssueIdentity,
  ) {
    const source = await host.log.sourceIn(unit, host.authority.logAccess, scope)
    if ('failure' in source) return { kind: 'unavailable' } as const
    const prefix = await host.log.readPrefixIn(unit, host.authority.logAccess, source.source)
    if ('failure' in prefix) return { kind: 'unavailable' } as const
    const state = readDriverRunState(prefix.entries, identity.origin.run, identity.origin.attempt)
    if (!state?.original || state.latest === undefined)
      throw new StorageDefect('original Tool lacks its Session Run facts')
    return {
      kind: 'classified' as const,
      late: state.ended || compareInteger(state.latest, identity.origin.attempt) !== 0,
    }
  }
  const support = Object.freeze<ToolOriginalIssueSupport>({
    storage: host.options.storage,
    log,
    access: host.authority.logAccess,
    async classifyTerminalIn(unit, identity) {
      unit.assertStorage(host.options.storage)
      const scope = { tenant: identity.ref.tenant, session: identity.ref.session }
      if (!tenantIdEquals(scope.tenant, host.options.tenant)) return { kind: 'denied' }
      const original = await readSessionToolOriginalIn(unit, host.options, identity.ref)
      if (!original || text(original) !== text(identity)) return { kind: 'denied' }
      return host.authority.withinOriginalRead(unit, scope, () =>
        terminalClassificationIn(unit, scope, original),
      )
    },
    current: {
      authorizeIn: async (unit, identity) => {
        unit.assertStorage(host.options.storage)
        const held = active.get(unit)
        return held && text(held.participant.identity) === text(identity)
          ? check(unit, held)
          : ({ kind: 'denied' } as const)
      },
    },
    admission: {
      admitOriginal: participant => track(() => admit(participant)),
      consumeOriginal: claim => track(() => consume(claim)),
    },
  })
  return Object.freeze({
    support: async (authority: ReturnType<typeof runtimeAuthority>['coordination']) =>
      authority === host.authority.coordination && host.isOpen() && host.options.toolIssue
        ? support
        : ({ unavailable: true } as const),
    remember(scope: SessionScope, step: Preparation) {
      preparations.set(key(scope, step.call), { scope, step })
    },
    async close() {
      await Promise.all([...tasks])
    },
  })
}
function matches(scope: SessionScope, step: Preparation, identity: ToolOriginalIssueIdentity) {
  return (
    tenantIdEquals(scope.tenant, identity.ref.tenant) &&
    scope.session === identity.ref.session &&
    step.call === identity.ref.callId &&
    step.run === identity.origin.run &&
    compareInteger(step.attempt, identity.origin.attempt) === 0
  )
}
class ToolStageFailure extends Error {
  constructor(readonly value: ToolOriginalIssueFailure) {
    super(value.kind)
  }
}
function failure(error: unknown, identity: ToolOriginalIssueIdentity, started: boolean) {
  if (error instanceof StorageUnavailable)
    return started
      ? ({ kind: 'unknownCommit', identity } as const)
      : ({ kind: 'unavailable' } as const)
  if (error instanceof ToolStageFailure) return error.value
  if (error instanceof CoordinationRejection) return { kind: error.failure }
  throw error
}

function verifyIssuedTail(
  issued: Extract<ToolOriginalIssueStage, { kind: 'staged' | 'alreadyIssued' }>,
  tail: JsonNumber,
) {
  if (issued.kind !== 'staged') return
  if (
    !issued.positions.length ||
    compareInteger(issued.positions[issued.positions.length - 1]!, tail) !== 0
  )
    throw new StorageDefect('Tool issue positions do not end at the staged source')
}
