import { createHash } from 'node:crypto'
import { freezeValue } from './freeze.ts'
import { SharedMap } from '../journal/shared-map.ts'
import { OperationTable } from './operation-table.ts'
import { canonical } from './canonical.ts'
import {
  emptySessionSources,
  indexSession,
  withAttemptRecords,
  type SessionSources,
} from './session-sources.ts'
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
import type { JointDecision, JournalWrite, MemoryExecution, JointFact } from './journal.ts'
import { emptyReceivingState, type ReceivingState } from './journal-receiving.ts'
import { copyFinishing } from './journal-finishing.ts'
import { emptySessionView, type PublishedBatch, type SessionJournalView } from '../journal/index.ts'

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
      decision?: import('@omne-harness/session-contract').DurableEvidence
      form?: 'control'
      recall(receipt: CommitReceipt): unknown
    }
  >
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
    log: readonly PublishedBatch[]
    view: SessionJournalView
    blobs: SharedMap<string, unknown>
    executions: SharedMap<string, MemoryExecution>
    operations: OperationTable
    jointFacts: JointFact[]
    originals: SharedMap<string, readonly JournalOriginal[]>
    effectSteps: SharedMap<string, import('@omne-harness/agent-contract').StepId>
    modelSettlements: SharedMap<string, readonly import('./model-settlement.ts').ModelSettlement[]>
    originalByOperation: SharedMap<string, JournalOriginal>
    eventReceipts: SharedMap<string, CommandReceipt>
    ended: SharedMap<
      string,
      Readonly<{
        sequence: string
        source: import('@omne-harness/session-contract').DurableEvidence
      }>
    >
    background: SharedMap<string, readonly import('./background.ts').BackgroundFragment[]>
    controls: SharedMap<string, readonly import('@omne-harness/agent-contract').ControlRecord[]>
    pendingEvents: SharedMap<string, readonly import('@omne-harness/agent-contract').PendingCall[]>
    callOrigins: SharedMap<
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
    human: SharedMap<string, readonly import('./human.ts').HumanFragment[]>
    indexedEvents: SharedMap<string, number>
    inputBatches: SharedMap<
      InputId,
      readonly import('@omne-harness/session-contract').SessionBatchRecord[]
    >
    batches: SharedMap<
      string,
      readonly import('@omne-harness/session-contract').SessionBatchRecord[]
    >
    admissions: SharedMap<
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
    handoffs: value.handoffs.map(item => ({ ...item })),
    custodyAttempts: new Map(value.custodyAttempts),
    finishing: copyFinishing(value.finishing),
  }
}
function forked<T extends object>(tables: T): T {
  const out = { ...tables }
  for (const [name, value] of Object.entries(out))
    if (value instanceof SharedMap || value instanceof OperationTable)
      (out as Record<string, unknown>)[name] = value.fork()
  return out
}

// A fork per table: the draft shares every table with the root until it writes to one.
function cloneRoot(root: CommonRoot): CommonRoot {
  return {
    ...root,
    agent: { ...forked(root.agent), blobs: root.agent.blobs.forkTracked() },
    receiving: forked(root.receiving),
  }
}

function emptyCommonRoot(): CommonRoot {
  return {
    position: 0n,
    session: null,
    sources: emptySessionSources(),
    agent: {
      log: [],
      view: emptySessionView(),
      blobs: new SharedMap(),
      executions: new SharedMap(),
      operations: new OperationTable(),
      jointFacts: [],
      originals: new SharedMap(),
      originalByOperation: new SharedMap(),
      effectSteps: new SharedMap(),
      modelSettlements: new SharedMap(),
      eventReceipts: new SharedMap(),
      admissions: new SharedMap(),
      inputBatches: new SharedMap(),
      batches: new SharedMap(),
      indexedEvents: new SharedMap(),
      human: new SharedMap(),
      ended: new SharedMap(),
      background: new SharedMap(),
      controls: new SharedMap(),
      pendingEvents: new SharedMap(),
      callOrigins: new SharedMap(),
    },
    receiving: emptyReceivingState(),
  }
}

export function createCell<P>(tenant: TenantId, session: SessionId, hooks: JournalHooks<P>) {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('tenant must be minted by legal-identity')
  const namespace = JSON.stringify([text.value, session])
  let root: CommonRoot = emptyCommonRoot()
  let draft: CommonRoot | null = null
  let dirty = false
  let gate: string | null = null
  const unreadable = new Set<string>()
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
    if (execution) draft.agent.executions.set(executionKey, copyExecution(execution))
    try {
      const answered = action()
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
    notify: (execution: AgentExecutionId) => {
      notifications.add(execution)
    },
    current: () => root,
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
    adoptAttemptRecords(
      records: readonly import('@omne-harness/session-contract').SessionAttemptRecord[],
    ) {
      if (!draft) throw new Error('Session attempt records adopted outside common root')
      draft = { ...draft, sources: withAttemptRecords(draft.sources, records) }
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
        if (existing) state().agent.executions.set(at, copyExecution(existing))
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
