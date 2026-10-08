import {
  checkKey,
  checkAppendInput,
  messageLogPayload,
  factLogPayload,
  type LogEntryInput,
  type SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { SessionRef, UserMessage } from '@omne-harness-lite/messages'
import { parseTenantId, tenantIdEquals, isOk } from '@omne-harness-lite/identity-values'
import { StorageUnavailable, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import { checkOperationRef, sessionFactPayload } from '@omne-harness-lite/session-runtime'
import type {
  Access,
  CreateSessionInput,
  OperationRef,
  Receipt,
  SessionDescription,
  PublicFailure,
  SessionHead,
  SessionFact,
} from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { AdmissionFailure } from './admission-types.ts'
import { InvalidStateInput } from './state-values.ts'
import { runtimeAuthority } from './runtime-authority.ts'
import { createSessionLifecycle } from './coordination.ts'
import { createLocalSessionState } from './state-participant.ts'
import { createLocalOperationReceipts } from './receipt-participant.ts'
import { creationInput, runtimeSemantic, RuntimeRejection } from './runtime-values.ts'
import {
  creationByOperation,
  creationBySession,
  decodeCreation,
  publishCreation,
  reserveCreation,
  sessionRef,
} from './runtime-store.ts'
import type {
  LocalSessionIngress,
  RuntimeOptions,
  SessionIngressOperations,
} from './runtime-types.ts'

/** Persistent public ingress. The other SessionRuntime operations remain under construction. */
export function createLocalSessionIngress(options: RuntimeOptions): LocalSessionIngress {
  const tenant = parseTenantId(options.tenant)
  if (
    !isOk(tenant) ||
    tenant.ok.account !== options.source.accountId ||
    !checkKey(options.principal)
  )
    throw new InvalidStateInput()
  for (const bound of [
    options.policy.maxSessions,
    options.policy.maxRecordBytes,
    options.policy.maxInFlight,
    options.policy.maxSteps,
  ])
    if (!Number.isSafeInteger(bound) || bound < 1 || bound >= Number.MAX_SAFE_INTEGER)
      throw new InvalidStateInput()
  const owner = new SessionIngress(
    Object.freeze({
      ...options,
      tenant: Object.freeze(tenant.ok),
      source: Object.freeze({ ...options.source }),
      policy: Object.freeze({ ...options.policy }),
    }),
  )
  return Object.freeze({
    access: owner.access,
    operations: owner.operations,
    tenancy: owner.tenancy,
    coordinationAuthority: owner.coordinationAuthority,
    lifecycle: owner.lifecycle,
    close: owner.close,
  })
}
class SessionIngress implements LocalSessionIngress {
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly access: Access
  readonly log: SessionLogParticipant
  readonly state: ReturnType<typeof createLocalSessionState>
  readonly receipts: ReturnType<typeof createLocalOperationReceipts>
  readonly operations: SessionIngressOperations
  readonly tenancy: LocalSessionIngress['tenancy'] = Object.freeze<LocalSessionIngress['tenancy']>({
    holdingTenant: async session => {
      const result = await this.run(this.access, () => this.ownership(session), [] as const)
      if ('failure' in result)
        return { failure: result.failure === 'denied' ? 'invalidInput' : result.failure }
      return result
    },
  })
  get coordinationAuthority() {
    return this.authority.coordination
  }
  readonly lifecycle: LocalSessionIngress['lifecycle']
  readonly pending = new Set<Promise<unknown>>()
  accepting = true
  constructor(readonly options: RuntimeOptions) {
    this.authority = runtimeAuthority(options)
    this.access = this.authority.access
    this.log = options.log(this.authority.log)
    this.state = createLocalSessionState({
      ...options,
      authority: this.authority.state,
      policy: options.policy.state,
      isOpen: () => true,
    })
    this.receipts = createLocalOperationReceipts({
      ...options,
      authority: this.authority.receipts,
      policy: options.policy.receipts,
      log: this.log,
      logAuthority: this.authority.logAccess,
      isOpen: () => true,
    })
    const lifecycle = createSessionLifecycle({
      options,
      authority: this.authority,
      state: this.state,
      log: this.log,
      member: work => this.member(work),
      head: (unit, scope) => this.head(unit, scope),
      append: (unit, scope, entries) => this.append(unit, scope, entries),
      instant: () => this.instant(),
    })
    this.lifecycle = Object.freeze({
      commitStep: (authority, scope, source, step) =>
        this.run(
          this.access,
          () => lifecycle.commitStep(authority, scope, source, step),
          [] as const,
        ),
    })
    this.operations = Object.freeze({
      createSession: (access, input) =>
        this.run(access, () => this.create(input), ['conflict'] as const),
      submitInput: (access, session, key, message) =>
        this.run(access, () => this.submit(session, key, message), [
          'notFound',
          'notAccepting',
          'identityConflict',
        ] as const),
      readSession: (access, session) =>
        this.run(
          access,
          () => this.member(unit => this.describe(unit, sessionRef(session, options))),
          ['notFound'] as const,
        ),
      readProgress: (access, session) =>
        this.run(
          access,
          () => this.member(unit => this.progress(unit, sessionRef(session, options))),
          ['notFound'] as const,
        ),
      readReceipt: (access, operation) =>
        this.run(access, () => this.member(unit => this.readReceipt(unit, operation)), [] as const),
    })
  }
  run<T, R extends RuntimeRejection['failure']>(
    access: Access,
    work: () => Promise<T>,
    reasons: readonly R[],
  ): Promise<T | PublicFailure | { readonly failure: R }> {
    if (!this.accepting || this.pending.size >= this.options.policy.maxInFlight)
      return Promise.resolve({ failure: 'unavailable' })
    if (access !== this.access) return Promise.resolve({ failure: 'denied' })
    const promise = this.execute(work, reasons)
    this.pending.add(promise)
    void promise.then(
      () => this.pending.delete(promise),
      () => this.pending.delete(promise),
    )
    return promise
  }
  async execute<T, R extends RuntimeRejection['failure']>(
    work: () => Promise<T>,
    reasons: readonly R[],
  ): Promise<T | PublicFailure | { readonly failure: R }> {
    try {
      return await work()
    } catch (error) {
      const failure = this.expectedFailure(error, reasons)
      if (failure) return failure
      throw error
    }
  }
  expectedFailure<R extends RuntimeRejection['failure']>(
    error: unknown,
    reasons: readonly R[],
  ): PublicFailure | { readonly failure: R } | undefined {
    if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
    if (error instanceof StorageUnavailable) return { failure: 'unavailable' }
    if (error instanceof AdmissionFailure && error.reason === 'denied') return { failure: 'denied' }
    if (!(error instanceof RuntimeRejection)) return undefined
    return this.runtimeFailure(error.failure, reasons)
  }
  runtimeFailure<R extends RuntimeRejection['failure']>(
    failure: RuntimeRejection['failure'],
    reasons: readonly R[],
  ): PublicFailure | { readonly failure: R } | undefined {
    if (failure === 'invalidInput' || failure === 'denied' || failure === 'unavailable')
      return { failure }
    if (reasons.includes(failure as R)) return { failure: failure as R }
    return undefined
  }
  close = async () => {
    this.accepting = false
    const settled = await Promise.allSettled([...this.pending])
    const errors = settled.filter(r => r.status === 'rejected').map(r => r.reason)
    if (errors.length) throw new AggregateError(errors, 'Session ingress drain failed')
  }
  member<T>(action: (unit: StorageUnit) => Promise<T>): Promise<T> {
    return this.options.admission.withMember(
      this.options.source,
      this.options.tenant,
      this.options.storage,
      (unit, guard) => this.authority.within(unit, guard, () => action(unit)),
    )
  }
  operation(
    kind: OperationRef['operation'],
    key: string,
    session: SessionRef | null,
  ): OperationRef {
    const checked = checkOperationRef({
      tenant: this.options.tenant,
      principal: this.options.principal,
      operation: kind,
      operationKey: key,
      session,
    })
    if ('failure' in checked) throw new InvalidStateInput()
    return checked.operation
  }
  async create(requested: CreateSessionInput) {
    const input = creationInput(requested, this.options.policy.maxRecordBytes),
      operation = this.operation('createSession', input.operationKey, null),
      semantic = runtimeSemantic(input, this.options.policy.maxRecordBytes)
    const reserved = await this.reserve(operation, input, semantic)
    if (reserved.kind === 'unknownCommit') return { kind: 'unknownCommit' as const, operation }
    if (reserved.kind !== 'consumed') throw new RuntimeRejection('unavailable')
    const session = sessionRef(reserved.receipt, this.options),
      scope = { tenant: this.options.tenant, session }
    const previous = await this.member(unit =>
      this.creationReceipt(unit, operation, semantic, session),
    )
    if (previous) return { kind: 'created' as const, session, receipt: previous }
    const initialized = await this.options.bootstrap.initialize(scope, input, reserved.ticket)
    if (initialized === 'definitionUnavailable')
      return { failure: 'definitionUnavailable' as const }
    if (initialized === 'unavailable') return { failure: 'unavailable' as const }
    if (initialized !== 'ready') throw new TypeError('invalid Session bootstrap result')
    try {
      const receipt = await this.member(unit =>
        this.publish(unit, scope, operation, input, semantic),
      )
      return { kind: 'created' as const, session, receipt }
    } catch (error) {
      if (error instanceof StorageUnavailable) return { kind: 'unknownCommit' as const, operation }
      throw error
    }
  }
  async reserve(operation: OperationRef, input: CreateSessionInput, semantic: string) {
    const ticket = await this.options.admission.reserve(this.options.source, {
      tenant: this.options.tenant,
      session: null,
      purpose: 'createSession',
      operationKey: input.operationKey,
      inputPosition: null,
    })
    const checked = await this.options.admission.query(ticket.ticket)
    if (checked.state !== 'ready' && checked.state !== 'consumed')
      throw new RuntimeRejection(
        checked.state === 'rejected' || checked.state === 'memberRejected'
          ? 'denied'
          : 'unavailable',
      )
    const reserved = await this.options.admission.consume(
      ticket.ticket,
      this.options.storage,
      (unit, guard) =>
        this.authority.within(unit, guard, async () => {
          const reserved = await reserveCreation(unit, operation, input, semantic, this.options)
          if (reserved.fresh)
            await this.append(unit, { tenant: this.options.tenant, session: reserved.session }, [
              {
                tenant: this.options.tenant,
                readKeys: [],
                payload: factLogPayload('session-runtime-local', '1', {
                  kind: 'session_initializing',
                  operation,
                  input,
                  semantic,
                }),
              },
            ])
          return reserved.session
        }),
    )
    return { ...reserved, ticket: ticket.ticket }
  }
  async creationReceipt(
    unit: StorageUnit,
    operation: OperationRef,
    semantic: string,
    session: SessionRef,
  ) {
    const row = await creationByOperation(unit, operation)
    if (!row || row.session !== session)
      throw new StorageDefect('missing original Session reservation')
    decodeCreation(row, this.options)
    if (row.semantic !== semantic) throw new RuntimeRejection('conflict')
    const original = await this.receipts.readIn(unit, this.authority.coordination, operation)
    if ('failure' in original) throw new RuntimeRejection(original.failure)
    if (original.kind === 'present') {
      if (
        !row.published ||
        original.semanticDigest !== semantic ||
        original.receipt.source.session !== session
      )
        throw new StorageDefect('invalid original Session publication')
      return original.receipt
    }
    if (row.published) throw new StorageDefect('Session publication missing receipt')
    return undefined
  }
  async publish(
    unit: StorageUnit,
    scope: SessionScope,
    operation: OperationRef,
    input: CreateSessionInput,
    semantic: string,
  ): Promise<Receipt> {
    const old = await this.creationReceipt(unit, operation, semantic, scope.session)
    if (old) return old
    const fact: SessionFact = {
      kind: 'session_created',
      operation,
      definition: input.definition,
      executionType: input.executionType,
      mode: input.mode,
      collaboration: input.collaboration,
      workspace: input.workspace ?? null,
      at: this.instant(),
    }
    const staged = await this.append(unit, scope, [
      { tenant: scope.tenant, readKeys: [], payload: sessionFactPayload(fact) },
    ])
    const state = await this.state.participant.stageIn(
      unit,
      this.authority.coordination,
      scope,
      null,
      { kind: 'initialize', stepKey: operation.operationKey },
    )
    if ('failure' in state)
      throw new RuntimeRejection(state.failure === 'denied' ? 'denied' : 'unavailable')
    const receipt = await this.saveReceipt(
      unit,
      operation,
      semantic,
      staged.entries[0]!.position,
      scope,
    )
    await publishCreation(unit, operation)
    return receipt
  }
  instant() {
    const at = this.options.now()
    if (at === 'unavailable') throw new RuntimeRejection('unavailable')
    return at
  }
  async append(unit: StorageUnit, scope: SessionScope, entries: readonly LogEntryInput[]) {
    const request = checkAppendInput(
      scope.session,
      entries,
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in request) throw new RuntimeRejection(request.failure)
    const appended = await this.log.appendIn(unit, this.authority.logAccess, request.ok)
    if ('failure' in appended && appended.failure === 'dedupeConflict')
      throw new RuntimeRejection('identityConflict')
    if ('failure' in appended)
      throw new RuntimeRejection(appended.failure === 'denied' ? 'denied' : 'unavailable')
    return appended
  }
  async saveReceipt(
    unit: StorageUnit,
    operation: OperationRef,
    semantic: string,
    position: Receipt['position'],
    scope: SessionScope,
  ) {
    const source = await this.log.sourceIn(unit, this.authority.logAccess, scope)
    if ('failure' in source) throw new RuntimeRejection(source.failure)
    const staged = await this.receipts.stageIn(unit, this.authority.coordination, semantic, {
      operation,
      position,
      source: source.source,
    })
    if ('failure' in staged) throw new RuntimeRejection(staged.failure)
    return staged.receipt
  }
  async readReceipt(unit: StorageUnit, requested: OperationRef) {
    const checked = checkOperationRef(requested)
    if ('failure' in checked) throw new InvalidStateInput()
    const operation = checked.operation
    if (
      !tenantIdEquals(operation.tenant, this.options.tenant) ||
      operation.principal !== this.options.principal
    )
      throw new RuntimeRejection('denied')
    const read = await this.receipts.readIn(unit, this.authority.coordination, operation)
    if ('failure' in read) throw new RuntimeRejection(read.failure)
    return read.kind === 'present'
      ? { kind: 'present' as const, receipt: read.receipt }
      : { kind: 'absent' as const }
  }
  async submit(requested: SessionRef, key: string, candidate: UserMessage) {
    const session = sessionRef(requested, this.options),
      operation = this.operation('submitInput', key, session),
      checked = judgeMessage(candidate)
    if ('rejected' in checked || checked.ok.type !== 'user') throw new InvalidStateInput()
    const message = checked.ok,
      semantic = runtimeSemantic(message, this.options.policy.maxRecordBytes)
    try {
      const receipt = await this.member(unit =>
        this.accept(unit, session, operation, message, semantic),
      )
      return { kind: 'accepted' as const, receipt }
    } catch (error) {
      if (error instanceof StorageUnavailable) return { kind: 'unknownCommit' as const, operation }
      throw error
    }
  }
  async accept(
    unit: StorageUnit,
    session: SessionRef,
    operation: OperationRef,
    message: UserMessage,
    semantic: string,
  ) {
    const scope = { tenant: this.options.tenant, session }
    const original = await this.receipts.readIn(unit, this.authority.coordination, operation)
    if ('failure' in original) throw new RuntimeRejection(original.failure)
    if (original.kind === 'present') {
      if (original.semanticDigest !== semantic) throw new RuntimeRejection('identityConflict')
      return original.receipt
    }
    const description = await this.describe(unit, session)
    if (description.session.lifecycle !== 'active') throw new RuntimeRejection('notAccepting')
    const head = await this.head(unit, scope)
    if (!head) throw new StorageDefect('published Session missing state')
    const appended = await this.append(unit, scope, [
        {
          tenant: scope.tenant,
          readKeys: [],
          dedupeKey: `message:${message.id}`,
          payload: messageLogPayload(message),
        },
      ]),
      position = appended.entries[0]!.position
    const fact: SessionFact = {
      kind: 'input_accepted',
      operation,
      semanticDigest: semantic,
      messagePosition: position,
      at: this.instant(),
    }
    const accepted = await this.append(unit, scope, [
      { tenant: scope.tenant, readKeys: [], payload: sessionFactPayload(fact) },
    ])
    const state = await this.state.participant.stageIn(
      unit,
      this.authority.coordination,
      scope,
      head.revision,
      { kind: 'acceptInput', operation, semanticDigest: semantic, position },
    )
    if ('failure' in state)
      throw new RuntimeRejection(state.failure === 'denied' ? 'denied' : 'unavailable')
    return this.saveReceipt(unit, operation, semantic, accepted.entries[0]!.position, scope)
  }
  async head(unit: StorageUnit, scope: SessionScope): Promise<SessionHead | null> {
    const state = await this.state.participant.headIn(unit, this.authority.coordination, scope)
    if ('failure' in state) throw new RuntimeRejection(state.failure)
    return state.head
  }
  async ownership(requested: unknown) {
    const session = sessionRef(requested, this.options)
    return this.options.storage.atomic(unit =>
      unit.run(async () => {
        const row = await creationBySession(unit, session)
        if (!row) return { failure: 'sessionNotFound' as const }
        decodeCreation(row, this.options)
        return { tenant: this.options.tenant }
      }),
    )
  }
  async describe(unit: StorageUnit, session: SessionRef) {
    const row = await creationBySession(unit, session)
    if (!row) throw new RuntimeRejection('notFound')
    const input = decodeCreation(row, this.options),
      scope = { tenant: this.options.tenant, session }
    const source = await this.log.sourceIn(unit, this.authority.logAccess, scope)
    if ('failure' in source) throw new RuntimeRejection(source.failure)
    const head = await this.head(unit, scope)
    if (Boolean(row.published) !== Boolean(head))
      throw new StorageDefect('Session publication/state mismatch')
    const description: SessionDescription = {
      ...scope,
      definition: input.definition,
      executionType: input.executionType,
      mode: input.mode,
      collaboration: input.collaboration,
      workspace: input.workspace ?? null,
      lifecycle: head?.lifecycle ?? 'initializing',
      source: source.source,
    }
    return { kind: 'session' as const, session: description }
  }
  async progress(unit: StorageUnit, session: SessionRef) {
    const description = await this.describe(unit, session),
      scope = { tenant: this.options.tenant, session },
      head = await this.head(unit, scope)
    return {
      kind: 'progress' as const,
      progress: {
        ...scope,
        run: head?.run?.id ?? null,
        attempt: head?.run?.attempt ?? null,
        state: head?.run?.state ?? ('idle' as const),
        position: null,
        source: description.session.source,
        projectionRuleVersion: 'session-runtime/1',
        reconciliation: head?.run === null ? ('verified' as const) : ('needed' as const),
      },
    }
  }
}
