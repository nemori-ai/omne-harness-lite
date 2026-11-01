import { createHash } from 'node:crypto'
import { freezeValue } from './freeze.ts'
import { canonical } from './canonical.ts'
import { emptySessionSources, indexSession, type SessionSources } from './session-sources.ts'
import type {
  Access,
  AgentJournal,
  AgentExecutionId,
  Authority,
  CommandReceipt,
  ExecutionMutation,
  Failure,
} from '@omne-harness/agent-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionId,
  WorkSnapshot,
  HistoryEntry,
  OperationRecord as SessionOperationRecord,
  SessionOperationId,
  InputId,
  RoutedInput,
  CommitReceipt,
} from '@omne-harness/session-contract'
import type {
  JointDecision,
  JournalWrite,
  MemoryExecution,
  OperationRecord,
  JointFact,
} from './journal.ts'
import { emptyReceivingState, type ReceivingState } from './journal-receiving.ts'
import { copyFinishing } from './journal-finishing.ts'

export type SessionState = Readonly<{
  lastCommit: CommitReceipt | null
  frozenReceipt: CommitReceipt | null
  modelView: import('./session-values.ts').MaterializedModelView
  snapshot: WorkSnapshot
  entries: readonly HistoryEntry[]
  operations: ReadonlyMap<
    SessionOperationId,
    {
      record: SessionOperationRecord
      projection?: import('@omne-harness/session-contract').SessionLogObservation
      /** The access decision evidence of the public commit that recorded this operation; absent for delegated and projected commits. */
      decision?: import('@omne-harness/session-contract').DurableEvidence
      /** `control` marks a cancelRun or stopCall that has a business batch: it recalls a control receipt. */
      form?: 'control'
      recall(receipt: CommitReceipt): unknown
    }
  >
  /** The answer-only control operations (ended, not-found): one row, no batch, no revision. */
  answers: ReadonlyMap<
    SessionOperationId,
    Readonly<{
      digest: string
      receipt: import('@omne-harness/session-contract').SessionControlReceipt<
        | import('@omne-harness/session-contract').RunTerminal
        | import('@omne-harness/session-contract').SessionCallTerminal
      >
      decision: import('@omne-harness/session-contract').DurableEvidence | null
    }>
  >
  inputs: ReadonlyMap<InputId, Extract<RoutedInput, { kind: 'ordinary' }>>
}>
export type JournalOriginal = Readonly<{
  method: JournalWrite
  input: object
  semantic: string
  receipt: CommandReceipt
}>
export type CommonRoot = Readonly<{
  position: bigint
  session: SessionState | null
  sources: SessionSources
  agent: {
    executions: Map<string, MemoryExecution>
    operations: Map<string, OperationRecord>
    jointFacts: JointFact[]
    originals: Map<string, readonly JournalOriginal[]>
    effectSteps: Map<string, import('@omne-harness/agent-contract').StepId>
    modelSettlements: Map<string, readonly import('./model-settlement.ts').ModelSettlement[]>
    originalByOperation: Map<string, JournalOriginal>
    eventReceipts: Map<string, CommandReceipt>
    authorities: Map<string, import('@omne-harness/session-contract').SessionAttemptRecord>
    ended: Map<
      string,
      Readonly<{
        sequence: string
        source: import('@omne-harness/session-contract').DurableEvidence
      }>
    >
    background: Map<string, readonly import('./background.ts').BackgroundFragment[]>
    controls: Map<string, readonly import('@omne-harness/agent-contract').ControlRecord[]>
    pendingEvents: Map<string, readonly import('@omne-harness/agent-contract').PendingCall[]>
    callOrigins: Map<
      string,
      Readonly<{
        first: string
        pending: import('@omne-harness/agent-contract').PendingCall
        association: Readonly<{
          sequence: string
          pending: import('@omne-harness/agent-contract').PendingCall
          source: import('@omne-harness/session-contract').DurableEvidence
        }> | null
      }>
    >
    human: Map<string, readonly import('./human.ts').HumanFragment[]>
    indexedEvents: Map<string, number>
    inputBatches: Map<
      InputId,
      readonly import('@omne-harness/session-contract').SessionBatchRecord[]
    >
    batches: Map<string, readonly import('@omne-harness/session-contract').SessionBatchRecord[]>
    admissions: Map<
      InputId,
      readonly import('@omne-harness/session-contract').SessionInputAdmission[]
    >
  }
  receiving: ReceivingState
}>
export type JournalHooks<P> = {
  authorize(input: Access<P>, method: string): Failure | undefined
  advances(execution: AgentExecutionId, authority: Authority): boolean
  participate(
    input: ExecutionMutation<P>,
    method: JournalWrite,
    receipt: CommandReceipt,
    decision: JointDecision | null,
  ): Failure | undefined
  committed(
    input: ExecutionMutation<P>,
    method: JournalWrite,
    receipt: CommandReceipt,
  ): Failure | undefined
}
export type JournalCell<P> = ReturnType<typeof createCell<P>>
/**
 * What one Journal write answers inside a common-root transaction. `rejected` is the persistent
 * rejection whose audit the write saved: the only failure whose draft is published.
 */
export type TransactionAnswer<T> =
  | Readonly<{ kind: 'answered'; outcome: Outcome<T, Failure> }>
  | Readonly<{ kind: 'rejected'; failure: Extract<Failure, { kind: 'conflict' }> }>

export function operationSemantic(input: ExecutionMutation<unknown>): string {
  const { principal: _principal, tenant: _tenant, ...value } = input
  return createHash('sha256').update(canonical(value)).digest('hex')
}
function copyExecution(value: MemoryExecution): MemoryExecution {
  return {
    ...value,
    attachments: value.attachments.map(item => ({ ...item })),
    inputs: [...value.inputs],
    inputRevisions: new Map(value.inputRevisions),
    resultRevisions: new Map(value.resultRevisions),
    events: [...value.events],
    controls: [...value.controls],
    results: [...value.results],
    effects: [...value.effects],
    observations: [...value.observations],
    stageReceipts: new Map(value.stageReceipts),
    observed: new Map(value.observed),
    admissions: [...value.admissions],
    entries: [...value.entries],
    // A write changes a handoff record in place (resolution, history, retirement), so each record
    // is copied, not only the list.
    handoffs: value.handoffs.map(item => ({ ...item })),
    custodyAttempts: new Map(value.custodyAttempts),
    // F2 replaces an author route at its index and the writes append to the lists, so the lists
    // and maps are copied; the records themselves are immutable.
    finishing: copyFinishing(value.finishing),
  }
}
function cloneRoot(root: CommonRoot): CommonRoot {
  return {
    ...root,
    agent: {
      ...root.agent,
      executions: new Map(root.agent.executions),
      operations: new Map(root.agent.operations),
      jointFacts: [...root.agent.jointFacts],
      originals: new Map(root.agent.originals),
      originalByOperation: new Map(root.agent.originalByOperation),
      effectSteps: new Map(root.agent.effectSteps),
      modelSettlements: new Map(root.agent.modelSettlements),
      eventReceipts: new Map(root.agent.eventReceipts),
      authorities: new Map(root.agent.authorities),
      admissions: new Map(root.agent.admissions),
      inputBatches: new Map(root.agent.inputBatches),
      batches: new Map(root.agent.batches),
      indexedEvents: new Map(root.agent.indexedEvents),
      human: new Map(root.agent.human),
      ended: new Map(root.agent.ended),
      background: new Map(root.agent.background),
      controls: new Map(root.agent.controls),
      pendingEvents: new Map(root.agent.pendingEvents),
      callOrigins: new Map(root.agent.callOrigins),
    },
    receiving: {
      pendingBindings: new Map(root.receiving.pendingBindings),
      materials: new Map(root.receiving.materials),
      deliveries: new Map(root.receiving.deliveries),
      aliases: new Map(root.receiving.aliases),
      bindings: new Map(root.receiving.bindings),
      consumerExecutions: new Map(root.receiving.consumerExecutions),
      targets: new Map(root.receiving.targets),
      callTargets: new Map(root.receiving.callTargets),
      executionTargets: new Map(root.receiving.executionTargets),
    },
  }
}

export function createCell<P>(tenant: TenantId, session: SessionId, hooks: JournalHooks<P>) {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('tenant must be minted by legal-identity')
  const namespace = JSON.stringify([text.value, session])
  let root: CommonRoot = {
    position: 0n,
    session: null,
    sources: emptySessionSources(),
    agent: {
      executions: new Map(),
      operations: new Map(),
      jointFacts: [],
      originals: new Map(),
      originalByOperation: new Map(),
      effectSteps: new Map(),
      modelSettlements: new Map(),
      eventReceipts: new Map(),
      authorities: new Map(),
      admissions: new Map(),
      inputBatches: new Map(),
      batches: new Map(),
      indexedEvents: new Map(),
      human: new Map(),
      ended: new Map(),
      background: new Map(),
      controls: new Map(),
      pendingEvents: new Map(),
      callOrigins: new Map(),
    },
    receiving: emptyReceivingState(),
  }
  let draft: CommonRoot | null = null
  let dirty = false
  let gate: string | null = null
  const unreadable = new Set<string>()
  const originals = new WeakMap<MemoryExecution, MemoryExecution>()
  const listeners = new Map<AgentExecutionId, Set<() => void>>()
  const notifications = new Set<AgentExecutionId>()
  const pauses = new Map<string, { reached(): void; released: Promise<void> }>()
  const plannedEvidence = new Map<
    string,
    { semantic: string; evidence: import('@omne-harness/agent-contract').DurableEvidence }
  >()
  let activeWrite: { input: ExecutionMutation<P>; method: JournalWrite } | null = null
  const semantic = operationSemantic
  const failures = new Map<string, 'before-publish' | 'after-publish'>()
  const key = (input: ExecutionMutation<P>, method: string) =>
    JSON.stringify([input.execution, input.operation, method])
  const state = () => draft ?? root
  const authorize = (input: Access<P>, method: string): Failure | undefined => {
    if (!tenantEquals(tenant, input.tenant)) return { kind: 'denied', action: method }
    return hooks.authorize(input, method)
  }
  const touch = () => {
    if (!draft) throw new Error('write outside common-root transaction')
    dirty = true
  }
  const waiters = (execution: AgentExecutionId) => {
    let set = listeners.get(execution)
    if (!set) {
      set = new Set()
      listeners.set(execution, set)
    }
    return set
  }
  const publish = (captured: CommonRoot) => {
    if (!draft || !dirty) return
    if (root !== captured) throw new Error('common-root changed inside synchronous preparation')
    if (gate !== null) throw new Error(`quarantined: ${gate}`)
    if (draft.session) {
      freezeValue(draft.session.snapshot)
      freezeValue(draft.session.entries)
    }
    root = { ...draft, position: root.position + 1n }
  }
  const notify = () => {
    for (const execution of notifications) {
      const set = waiters(execution)
      const pending = [...set]
      set.clear()
      for (const wake of pending) wake()
    }
    notifications.clear()
  }
  const transact = <T>(
    input: ExecutionMutation<P>,
    method: JournalWrite,
    action: () => TransactionAnswer<T>,
  ): Outcome<T, Failure> => {
    const rejected = authorize(input, method)
    if (rejected) return fail(rejected)
    if (gate !== null)
      return fail({ kind: 'unavailable', owner: 'session-history', diagnostic: gate })
    const planned = plannedEvidence.get(key(input, method))
    if (planned && planned.semantic !== semantic(input))
      return fail({ kind: 'conflict', operation: input.operation })
    const point = failures.get(key(input, method))
    failures.delete(key(input, method))
    if (point === 'before-publish')
      return fail({
        kind: 'unavailable',
        owner: 'session-memory-journal',
        diagnostic: 'injected before publication',
      })
    if (draft) throw new Error('nested common-root transaction')
    const captured = root
    draft = cloneRoot(root)
    dirty = false
    activeWrite = { input, method }
    const executionKey = JSON.stringify([text.value, input.execution])
    const execution = draft.agent.executions.get(executionKey)
    if (execution) {
      const copy = copyExecution(execution)
      originals.set(copy, execution)
      draft.agent.executions.set(executionKey, copy)
    }
    try {
      const answered = action()
      // A persistent rejection (Agent SPEC "查询的四种结论与持久拒绝") answers conflict and still
      // publishes its audit; every other failure discards the draft.
      const result = answered.kind === 'rejected' ? fail(answered.failure) : answered.outcome
      if (
        answered.kind === 'answered' &&
        'failure' in result &&
        result.failure.kind !== 'commit-unknown'
      )
        return result
      const final = authorize(input, method)
      if (final) return fail(final)
      if (dirty && gate !== null)
        return fail({
          kind: 'unavailable',
          owner: 'session-memory-journal',
          diagnostic: `quarantined: ${gate}`,
        })
      publish(captured)
      return point === 'after-publish' && dirty
        ? fail({ kind: 'commit-unknown', operation: input.operation })
        : result
    } finally {
      if (root === captured) notifications.clear()
      activeWrite = null
      draft = null
      dirty = false
      notify()
    }
  }
  return {
    tenant,
    session,
    namespace,
    state,
    authorize,
    transact,
    touch,
    waiters,
    advances: hooks.advances,
    participate: hooks.participate,
    committed: hooks.committed,
    original: (execution: MemoryExecution) => originals.get(execution),
    notify: (execution: AgentExecutionId) => {
      notifications.add(execution)
    },
    current: () => root,
    /** Whether a common-root transaction is open: only then may a preparation write. */
    writing: () => draft !== null,
    issueEvidence(evidence: import('@omne-harness/agent-contract').DurableEvidence) {
      return activeWrite
        ? (plannedEvidence.get(key(activeWrite.input, activeWrite.method))?.evidence ?? evidence)
        : evidence
    },
    planEvidence(
      input: Parameters<AgentJournal<P>['open']>[0] | Parameters<AgentJournal<P>['submit']>[0],
      method: 'open' | 'submit',
      evidence: import('@omne-harness/agent-contract').DurableEvidence,
    ) {
      const rejected = authorize(input, 'planEvidence')
      if (rejected) return fail(rejected)
      if (Object.values(evidence).some(value => typeof value !== 'string' || value.length === 0))
        return fail<Failure>({
          kind: 'invalid',
          field: 'evidence',
          reason: 'incomplete original evidence',
        })
      const at = key(input, method),
        fixed = semantic(input),
        prior = plannedEvidence.get(at)
      for (const [other, value] of plannedEvidence)
        if (
          canonical(value.evidence) === canonical(evidence) &&
          (other !== at || value.semantic !== fixed)
        )
          return fail<Failure>({ kind: 'conflict', operation: input.operation })
      const originals = root.agent.originals.get(input.execution) ?? []
      if (
        originals.some(
          record =>
            record.receipt.operation === input.operation &&
            (canonical(record.receipt.evidence) !== canonical(evidence) ||
              record.semantic !== fixed),
        )
      )
        return fail<Failure>({ kind: 'conflict', operation: input.operation })
      if (prior && (prior.semantic !== fixed || canonical(prior.evidence) !== canonical(evidence)))
        return fail<Failure>({ kind: 'conflict', operation: input.operation })
      plannedEvidence.set(at, { semantic: fixed, evidence: structuredClone(evidence) })
      return { ok: undefined } as const
    },
    replaceSession(value: SessionState) {
      if (!draft) throw new Error('Session write outside common root')
      draft = {
        ...draft,
        session: value,
        sources: indexSession(draft.sources, value, namespace, draft.session),
      }
      touch()
    },
    mutate<T>(action: () => T): T {
      if (draft) return action()
      const captured = root
      draft = cloneRoot(root)
      dirty = false
      try {
        const result = action()
        publish(captured)
        return result
      } finally {
        draft = null
        dirty = false
        notify()
      }
    },
    mutateExecution<T>(execution: AgentExecutionId, action: () => T): T {
      return this.mutate(() => {
        const at = JSON.stringify([text.value, execution])
        const existing = state().agent.executions.get(at)
        if (existing) {
          const copy = copyExecution(existing)
          originals.set(copy, existing)
          state().agent.executions.set(at, copy)
        }
        const value = action()
        touch()
        return value
      })
    },
    async wait(input: ExecutionMutation<P>, method: JournalWrite) {
      const pause = pauses.get(key(input, method))
      if (pause) {
        pauses.delete(key(input, method))
        pause.reached()
        await pause.released
      }
    },
    pause(input: ExecutionMutation<P>, method: JournalWrite) {
      const reached = Promise.withResolvers<void>()
      const released = Promise.withResolvers<void>()
      pauses.set(key(input, method), { reached: reached.resolve, released: released.promise })
      return { reached: reached.promise, release: () => released.resolve() }
    },
    fault(
      input: ExecutionMutation<P>,
      method: JournalWrite,
      point: 'before-publish' | 'after-publish',
    ) {
      failures.set(key(input, method), point)
    },
    quarantine(diagnostic: string) {
      gate = diagnostic
    },
    gate: () => gate,
    historyAvailable(execution: string, available: boolean) {
      if (available) unreadable.delete(execution)
      else unreadable.add(execution)
    },
    historyReadable: (execution: string) => !unreadable.has(execution),
  }
}
