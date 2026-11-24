import type { JsonValue } from '@omne-harness/json-text'
import type {
  DispatchInstants,
  DispatchProgress,
  DispatchRecord,
  Lookup,
  ModelAttemptDiagnostic,
  ModelDiagnosticsPage,
} from '@omne-harness/model-contract'
import type {
  SessionCallAccountView,
  SessionDiagnosticGap,
  SessionDiagnosticMilliseconds,
  SessionDiagnosticUnknown,
  SessionFactCount,
  SessionModelAttemptDiagnostic,
  SessionModelCallDiagnostic,
  SessionRunAttempts,
  SessionRunCause,
  SessionRunControl,
  SessionRunDiagnostic,
  SessionToolCallDiagnostic,
} from '../view-types.ts'
import type { HistoryEntry } from '@omne-harness/session-contract'
import type { DiagnosticPage, ToolStreamSelection } from '@omne-harness/tool-contract'
import type { BlockAnswer } from './blocks.ts'
import { member, textAt } from './json-tree.ts'
import { readsOf } from './reads.ts'
import type { CallAccount, RequestBlockChoice, SourceAnswer } from './sources.ts'

export const PROJECTED_KINDS: readonly string[] = Object.freeze([
  'run.started',
  'run.attempt-started',
  'run.attempt-released',
  'run.attempt-exited',
  'control.requested',
  'control.progress',
  'run.terminal',
  'call.bound',
  'call.execution-fact',
  'message.user',
  'message.assistant',
  'message.tool',
  'message.tool_internal',
  'message.system_reminder',
  'message.compaction',
])

const RUN_OUTCOMES = ['completed', 'failed', 'cancelled'] as const
const ENTRY_CLASSES = ['interactive', 'dispatch'] as const
const CONTROL_TARGETS = ['run', 'producer', 'session'] as const
const CONTROL_INTENTS = ['control', 'interrupt', 'auto-archive'] as const
const CONTROL_STATES = ['committed', 'propagating', 'reconciled'] as const
const CALL_KINDS = ['model', 'tool'] as const
const REFUSALS = ['denied', 'invalid', 'unsupported', 'capacity'] as const
const FIT_REASONS = ['fixed', 'protected-floor', 'after-compaction'] as const
const NODE_CATEGORIES = ['exception', 'invariant', 'unsupported-path', 'rejected'] as const
const CONCLUSIONS = ['complete', 'fail', 'cancelled'] as const
const PLAIN_FAILURES = [
  'request-rejected',
  'compaction-invalid',
  'compaction-failed',
  'message-rejected',
  'extension-stop',
  'guard',
] as const
const RELEASE_REASONS = ['ended', 'bounded', 'cancelled', 'released', 'superseded'] as const

function oneOf<T extends string>(value: string | undefined, set: readonly T[]): T | undefined {
  return set.find(item => item === value)
}

function producerOf(value: JsonValue | undefined): Producer | null {
  const kind = oneOf(textAt(value, 'kind'), CALL_KINDS)
  const call = textAt(value, 'call')
  return kind === undefined || call === undefined ? null : { kind, call }
}

export type Producer = Readonly<{ kind: 'model' | 'tool'; call: string }>
export type CallRegistration = Readonly<{
  position: string
  consumption: string | null
  producer: Producer | null
  kind: 'model' | 'tool'
  reference: string | null
  purpose: string
}>
export type AttemptCounts = Readonly<{
  started: number
  released: Readonly<Record<(typeof RELEASE_REASONS)[number], number>>
  exited: number
}>
export type FactSubject =
  | Readonly<{ by: 'consumption'; consumption: string }>
  | Readonly<{ by: 'producer'; producer: Producer }>
export type ExecutionFact = Readonly<{ kind: string; subject: FactSubject | null }>
export type RunSkeleton = Readonly<{
  run: string
  execution: string
  entry: 'interactive' | 'dispatch'
  position: string
  attempts: AttemptCounts
  controls: readonly SessionRunControl[]
  terminal: Readonly<{
    outcome: 'completed' | 'failed' | 'cancelled'
    record: string | null
    end: JsonValue | null
  }> | null
  calls: readonly CallRegistration[]
  messages: ReadonlyMap<string, number>
  facts: readonly ExecutionFact[]
}>

function controlOf(entry: HistoryEntry, kind: 'requested' | 'progress'): SessionRunControl {
  const progress = member(entry.payload, 'progress')
  return {
    position: entry.id,
    kind,
    target: oneOf(textAt(progress, 'target', 'kind'), CONTROL_TARGETS) ?? null,
    intent: oneOf(textAt(progress, 'intent', 'kind'), CONTROL_INTENTS) ?? null,
    state: oneOf(textAt(progress, 'state'), CONTROL_STATES) ?? null,
  }
}

function callOf(entry: HistoryEntry): CallRegistration | undefined {
  const { payload } = entry
  const registered = member(payload, 'registration')
  const producer = member(member(registered ?? payload, 'binding'), 'producer')
  const kind = oneOf(textAt(payload, 'kind') ?? textAt(producer, 'kind'), CALL_KINDS)
  if (kind === undefined) return undefined
  return {
    position: entry.id,
    consumption: textAt(payload, 'consumption') ?? null,
    producer: producerOf(producer),
    kind,
    reference: textAt(payload, 'reference') ?? textAt(producer, 'call') ?? null,
    purpose:
      textAt(payload, 'purpose') ??
      textAt(registered, 'purpose') ??
      textAt(registered, 'binding', 'consumer', 'purpose') ??
      'unknown',
  }
}

type Draft = {
  attempts: {
    started: number
    released: Record<(typeof RELEASE_REASONS)[number], number>
    exited: number
  }
  controls: SessionRunControl[]
  terminal: RunSkeleton['terminal']
  calls: CallRegistration[]
  messages: Map<string, number>
  facts: ExecutionFact[]
}

function registerCall(calls: CallRegistration[], entry: HistoryEntry): void {
  const call = callOf(entry)
  if (call === undefined) return
  const index =
    call.consumption === null
      ? -1
      : calls.findIndex(known => known.consumption === call.consumption)
  if (index === -1) calls.push(call)
  else
    calls[index] = {
      ...(call.reference === null ? calls[index]! : call),
      position: calls[index]!.position,
    }
}

function factSubjectOf(payload: JsonValue): FactSubject | null {
  const consumption = textAt(payload, 'consumption') ?? textAt(payload, 'fact', 'consumption')
  if (consumption !== undefined) return { by: 'consumption', consumption }
  const producer = producerOf(member(member(payload, 'fact'), 'producer'))
  return producer === null ? null : { by: 'producer', producer }
}

type Folder = (draft: Draft, entry: HistoryEntry) => void

const FOLDERS: Readonly<Record<string, Folder>> = {
  'run.attempt-started': draft => {
    draft.attempts.started += 1
  },
  'run.attempt-released': (draft, entry) => {
    const reason = oneOf(textAt(entry.payload, 'reason'), RELEASE_REASONS)
    if (reason !== undefined) draft.attempts.released[reason] += 1
  },
  'run.attempt-exited': draft => {
    draft.attempts.exited += 1
  },
  'call.execution-fact': (draft, entry) => {
    const kind = textAt(entry.payload, 'fact', 'kind')
    if (kind !== undefined) draft.facts.push({ kind, subject: factSubjectOf(entry.payload) })
  },
  'run.terminal': (draft, entry) => {
    const outcome = oneOf(textAt(entry.payload, 'terminal', 'outcome'), RUN_OUTCOMES)
    if (outcome === undefined) return
    const end = member(entry.payload, 'end')
    draft.terminal = {
      outcome,
      record: textAt(entry.payload, 'cause', 'record') ?? null,
      end: end === undefined || end.kind === 'null' ? null : end,
    }
  },
  'control.requested': (draft, entry) => {
    draft.controls.push(controlOf(entry, 'requested'))
  },
  'control.progress': (draft, entry) => {
    draft.controls.push(controlOf(entry, 'progress'))
  },
  'call.bound': (draft, entry) => {
    registerCall(draft.calls, entry)
  },
}

function fold(draft: Draft, entry: HistoryEntry): void {
  const folder = Object.hasOwn(FOLDERS, entry.kind) ? FOLDERS[entry.kind] : undefined
  if (folder !== undefined) folder(draft, entry)
  else if (entry.kind.startsWith('message.'))
    draft.messages.set(entry.kind, (draft.messages.get(entry.kind) ?? 0) + 1)
}

function skeletonOf(
  started: HistoryEntry,
  run: string,
  later: readonly HistoryEntry[],
): RunSkeleton {
  const draft: Draft = {
    attempts: {
      started: 0,
      released: { ended: 0, bounded: 0, cancelled: 0, released: 0, superseded: 0 },
      exited: 0,
    },
    controls: [],
    terminal: null,
    calls: [],
    messages: new Map(),
    facts: [],
  }
  for (const entry of later) fold(draft, entry)
  return {
    run,
    execution: textAt(started.payload, 'execution') ?? 'unknown',
    entry: oneOf(textAt(started.payload, 'entry'), ENTRY_CLASSES) ?? 'interactive',
    position: started.id,
    ...draft,
  }
}

export type RunCollector = Readonly<{
  feed(entry: HistoryEntry): boolean
  runs(): readonly RunSkeleton[]
  stoppedAt(): string | null
}>

export function collectRuns(
  limit: Readonly<{ run: string | null; maxRuns: number }>,
): RunCollector {
  const runs: RunSkeleton[] = []
  let pending: HistoryEntry[] = []
  let stoppedAt: string | null = null
  return {
    feed(entry) {
      if (stoppedAt !== null) return true
      const run = entry.kind === 'run.started' ? textAt(entry.payload, 'run') : undefined
      if (run === undefined) {
        pending.push(entry)
        return false
      }
      const later = pending.reverse()
      pending = []
      if (limit.run === null || limit.run === run) runs.push(skeletonOf(entry, run, later))
      const done = limit.run === null ? runs.length >= limit.maxRuns : limit.run === run
      if (done) stoppedAt = entry.id
      return done
    },
    runs: () => runs,
    stoppedAt: () => stoppedAt,
  }
}

export type ModelAnswers = Readonly<{
  lookup: SourceAnswer<Lookup>
  attempts: SourceAnswer<ModelDiagnosticsPage> | null
  dispatches: SourceAnswer<readonly DispatchRecord[]> | null
  choices: SourceAnswer<readonly RequestBlockChoice[]> | null
}>
export type ToolAnswers = Readonly<{
  current: SourceAnswer<ToolStreamSelection>
  account: SourceAnswer<CallAccount>
  diagnostics: SourceAnswer<DiagnosticPage>
}>
export type RunAnswers = Readonly<{
  models: ReadonlyMap<string, ModelAnswers>
  tools: ReadonlyMap<string, ToolAnswers>
  blocks: BlockAnswer | null
}>
export type Projected<T> = Readonly<{ value: T; gaps: readonly SessionDiagnosticGap[] }>

const unknown = (reason: SessionDiagnosticUnknown['reason']): SessionDiagnosticUnknown => ({
  kind: 'unknown',
  reason,
})

const textOrNull = (value: JsonValue | undefined, key: string): string | null =>
  textAt(value, key) ?? null

function failureOf(failure: JsonValue): SessionRunCause {
  const kind = textAt(failure, 'kind')
  switch (kind) {
    case 'node-failed': {
      const category = oneOf(textAt(failure, 'category'), NODE_CATEGORIES)
      const node = textAt(failure, 'node')
      const failureKind = textAt(failure, 'failureKind')
      return category === undefined || node === undefined || failureKind === undefined
        ? unknown('unsupported')
        : { kind, node, category, failureKind }
    }
    case 'model-refused':
      return {
        kind,
        failure: oneOf(textAt(failure, 'failure'), REFUSALS) ?? unknown('unsupported'),
      }
    case 'no-reply':
      return {
        kind,
        cause: textOrNull(failure, 'cause'),
        upstreamStatus: textOrNull(failure, 'upstreamStatus'),
      }
    case 'cannot-fit':
      return {
        kind,
        reason: oneOf(textAt(failure, 'reason'), FIT_REASONS) ?? unknown('unsupported'),
      }
    default: {
      const plain = oneOf(kind, PLAIN_FAILURES)
      return plain === undefined ? unknown('unsupported') : { kind: plain }
    }
  }
}

function causeOf(terminal: NonNullable<RunSkeleton['terminal']>): SessionRunCause {
  if (terminal.outcome === 'completed') return { kind: 'none' }
  const { end } = terminal
  if (end === null) return unknown('not-recorded')
  const failure = member(end, 'failure')
  if (failure === undefined || failure.kind === 'null') {
    const conclusion = oneOf(textAt(end, 'conclusion'), CONCLUSIONS)
    return conclusion === undefined ? unknown('unsupported') : { kind: 'no-failure', conclusion }
  }
  return failureOf(failure)
}

const millisecondsOf = (
  duration: ModelAttemptDiagnostic['timing']['execution'],
): SessionDiagnosticMilliseconds =>
  duration.kind === 'known'
    ? { kind: 'known', milliseconds: duration.milliseconds }
    : { kind: 'unknown' }

type SessionInstants = NonNullable<SessionModelAttemptDiagnostic['instants']>

const instantOf = (instant: string | null): SessionInstants['sent'] =>
  instant === null ? { kind: 'unknown' } : { kind: 'known', instant }

function instantsOf(instants: DispatchInstants): SessionInstants {
  return {
    prepared: instantOf(instants.prepared),
    sent: instantOf(instants.sent),
    responseStarted: instantOf(instants.responseStarted),
    firstContent: instantOf(instants.firstContent),
    ended: instantOf(instants.ended),
  }
}

type SessionProgress = NonNullable<
  Extract<SessionModelCallDiagnostic['call'], { kind: 'found' }>['progress']
>

const progressOf = (progress: DispatchProgress): SessionProgress => ({
  allowed: String(progress.allowed),
  made: String(progress.made),
  last:
    progress.last === null
      ? null
      : { cause: progress.last.cause, upstreamStatus: progress.last.upstreamStatus },
})

type DispatchAccounts = (dispatch: string) => SessionModelAttemptDiagnostic['account']

function dispatchAccountsOf(
  reference: string,
  dispatches: ModelAnswers['dispatches'],
): Projected<DispatchAccounts> {
  if (dispatches === null || dispatches.kind === 'gap') {
    const reason = dispatches === null ? 'not-recorded' : dispatches.reason
    return {
      value: () => unknown(reason),
      gaps: dispatches === null ? [] : [{ source: 'model', subject: reference, reason }],
    }
  }
  const records = new Map(dispatches.value.map(record => [record.dispatch as string, record]))
  return {
    value: dispatch => {
      const record = records.get(dispatch)
      if (record === undefined) return unknown('not-found')
      return record.account === null ? unknown('not-recorded') : accountViewOf(record.account)
    },
    gaps: [],
  }
}

type Reasoning = NonNullable<SessionModelAttemptDiagnostic['reasoning']>

// The receipt says whether the request carried reasoning back; no receipt is not knowing.
function dispatchReasoningOf(
  dispatches: ModelAnswers['dispatches'],
): (dispatch: string) => Reasoning {
  if (dispatches === null || dispatches.kind === 'gap') return () => 'unknown'
  const receipts = new Map(
    dispatches.value.map(record => [record.dispatch as string, record.materialization?.receipt]),
  )
  return dispatch => {
    const receipt = receipts.get(dispatch)
    if (receipt === undefined) return 'unknown'
    return receipt.replayCarried === true ? 'carried' : 'not-carried'
  }
}

function attemptOf(
  attempt: ModelAttemptDiagnostic,
  accounts: DispatchAccounts,
  reasoning: (dispatch: string) => Reasoning,
): SessionModelAttemptDiagnostic {
  const { adapter, outcome } = attempt
  return {
    dispatch: attempt.dispatch,
    revision: attempt.revision,
    adapter: {
      owner: adapter.owner,
      name: adapter.name,
      revision: adapter.revision,
      digest: adapter.digest,
    },
    send: attempt.send,
    firstContent: attempt.firstContent,
    outcome:
      outcome.kind === 'failed'
        ? { kind: 'failed', cause: outcome.cause, upstreamStatus: outcome.upstreamStatus }
        : outcome,
    instants: instantsOf(attempt.instants),
    timing: {
      materialize: millisecondsOf(attempt.timing.materialize),
      sendToResponse: millisecondsOf(attempt.timing.sendToResponse),
      sendToFirstContent: millisecondsOf(attempt.timing.sendToFirstContent),
      execution: millisecondsOf(attempt.timing.execution),
    },
    connectRetries: [...attempt.connectRetries],
    account: accounts(attempt.dispatch),
    reasoning: reasoning(attempt.dispatch),
  }
}

function attemptsOf(
  reference: string,
  answers: Pick<ModelAnswers, 'attempts' | 'dispatches'>,
): Projected<Pick<SessionModelCallDiagnostic, 'dispatches' | 'coverage'>> {
  const { attempts } = answers
  if (attempts === null) return { value: { dispatches: [], coverage: 'unknown' }, gaps: [] }
  if (attempts.kind === 'gap')
    return {
      value: { dispatches: [], coverage: 'unknown' },
      gaps: [{ source: 'model', subject: reference, reason: attempts.reason }],
    }
  const page = attempts.value
  const gaps: SessionDiagnosticGap[] = []
  if (page.coverage === 'expired-prefix')
    gaps.push({ source: 'model', subject: reference, reason: 'retention-expired' })
  if (page.next !== null) gaps.push({ source: 'model', subject: reference, reason: 'truncated' })
  const accounts = dispatchAccountsOf(reference, answers.dispatches)
  const reasoning = dispatchReasoningOf(answers.dispatches)
  gaps.push(...accounts.gaps)
  return {
    value: {
      dispatches: page.entries.map(attempt => attemptOf(attempt, accounts.value, reasoning)),
      coverage: page.coverage,
    },
    gaps,
  }
}

function modelCallOf(
  call: CallRegistration,
  answers: ModelAnswers | undefined,
  facts: readonly SessionFactCount[],
  blocks: BlockAnswer | null,
): Projected<SessionModelCallDiagnostic> {
  const reference = call.reference ?? call.position
  const base = { reference, purpose: call.purpose, facts } as const
  const lookup = answers?.lookup ?? { kind: 'gap', reason: 'not-recorded' }
  const none = { dispatches: [], coverage: 'unknown', reads: [] } as const
  if (lookup.kind === 'gap')
    return {
      value: { ...base, call: unknown(lookup.reason), ...none },
      gaps: [{ source: 'model', subject: reference, reason: lookup.reason }],
    }
  if (lookup.value.kind === 'not-accepted')
    return {
      value: { ...base, call: unknown('not-accepted'), ...none },
      gaps: [{ source: 'model', subject: reference, reason: 'not-accepted' }],
    }
  const { state } = lookup.value
  const given = answers ?? { attempts: null, dispatches: null, choices: null }
  const attempts = attemptsOf(reference, given)
  const reads = readsOf(reference, given, blocks)
  return {
    value: {
      ...base,
      call: {
        kind: 'found',
        call: state.call,
        phase: state.phase,
        ...(state.attempts === undefined ? {} : { progress: progressOf(state.attempts) }),
      },
      ...attempts.value,
      reads: reads.value,
    },
    gaps: [...attempts.gaps, ...reads.gaps],
  }
}

function accountViewOf(account: CallAccount): SessionCallAccountView {
  return {
    kind: 'account',
    usage: account.usage.map(item => ({
      name: item.name,
      unit: item.unit,
      state: item.state,
      lexeme: item.state === 'unknown' ? null : item.lexeme,
    })),
    cost: account.cost.map(item => ({
      source: item.source,
      unit: item.unit,
      state: item.state,
      lexeme: item.state === 'unknown' ? null : item.lexeme,
    })),
    duration:
      typeof account.duration === 'string'
        ? { kind: 'known', value: account.duration }
        : { kind: 'unknown' },
    receipt: account.receipt,
  }
}

function toolStateOf(current: ToolAnswers['current']): SessionToolCallDiagnostic['state'] {
  if (current.kind === 'gap') return unknown(current.reason)
  const { state } = current.value
  const terminal = state.phase === 'settled' ? state.terminal : null
  return {
    kind: 'found',
    call: state.call,
    phase: state.phase,
    relation: state.relation,
    terminal:
      terminal === null
        ? null
        : { kind: terminal.kind, cause: terminal.kind === 'failed' ? terminal.cause : null },
  }
}

function toolDiagnosticsOf(
  reference: string,
  diagnostics: SourceAnswer<DiagnosticPage>,
): Projected<SessionToolCallDiagnostic['diagnostics']> {
  if (diagnostics.kind === 'gap')
    return {
      value: unknown(diagnostics.reason),
      gaps: [{ source: 'tool', subject: reference, reason: diagnostics.reason }],
    }
  const page = diagnostics.value
  return {
    value: page.entries.map(({ operation, phase, code }) => ({ operation, phase, code })),
    gaps: page.next === null ? [] : [{ source: 'tool', subject: reference, reason: 'truncated' }],
  }
}

function toolCallOf(
  call: CallRegistration,
  answers: ToolAnswers | undefined,
  facts: readonly SessionFactCount[],
): Projected<SessionToolCallDiagnostic> {
  const reference = call.reference ?? call.position
  const current = answers?.current ?? { kind: 'gap', reason: 'not-recorded' }
  const account = answers?.account ?? { kind: 'gap', reason: 'not-recorded' }
  const diagnostics = toolDiagnosticsOf(
    reference,
    answers?.diagnostics ?? { kind: 'gap', reason: 'not-recorded' },
  )
  const gaps: SessionDiagnosticGap[] = []
  if (current.kind === 'gap')
    gaps.push({ source: 'tool', subject: reference, reason: current.reason })
  if (account.kind === 'gap')
    gaps.push({ source: 'tool', subject: reference, reason: account.reason })
  gaps.push(...diagnostics.gaps)
  return {
    value: {
      reference,
      state: toolStateOf(current),
      account: account.kind === 'gap' ? unknown(account.reason) : accountViewOf(account.value),
      facts,
      diagnostics: diagnostics.value,
    },
    gaps,
  }
}

const factCountsOf = (facts: readonly ExecutionFact[]): SessionFactCount[] => {
  const counts = new Map<string, number>()
  for (const fact of facts) counts.set(fact.kind, (counts.get(fact.kind) ?? 0) + 1)
  return [...counts].map(([kind, count]) => ({ kind, count: String(count) }))
}

const sameProducer = (left: Producer, right: Producer): boolean =>
  left.kind === right.kind && left.call === right.call

function ownerOf(
  subject: FactSubject | null,
  calls: readonly CallRegistration[],
): string | undefined {
  if (subject === null) return undefined
  const owner =
    subject.by === 'consumption'
      ? calls.find(call => call.consumption === subject.consumption)
      : calls.find(call => call.producer !== null && sameProducer(call.producer, subject.producer))
  return owner?.position
}

function attributeFacts(
  skeleton: RunSkeleton,
  calls: readonly CallRegistration[],
): Readonly<{ run: SessionFactCount[]; byCall: ReadonlyMap<string, SessionFactCount[]> }> {
  const run: ExecutionFact[] = []
  const byCall = new Map<string, ExecutionFact[]>()
  for (const fact of skeleton.facts) {
    const position = ownerOf(fact.subject, calls)
    if (position === undefined) run.push(fact)
    else byCall.set(position, [...(byCall.get(position) ?? []), fact])
  }
  return {
    run: factCountsOf(run),
    byCall: new Map([...byCall].map(([position, facts]) => [position, factCountsOf(facts)])),
  }
}

const attemptsViewOf = (attempts: AttemptCounts): SessionRunAttempts => ({
  started: String(attempts.started),
  released: {
    ended: String(attempts.released.ended),
    bounded: String(attempts.released.bounded),
    cancelled: String(attempts.released.cancelled),
    released: String(attempts.released.released),
    superseded: String(attempts.released.superseded),
  },
  exited: String(attempts.exited),
})

export function projectRun(
  skeleton: RunSkeleton,
  projected: number,
  answers: RunAnswers,
): Projected<SessionRunDiagnostic> {
  const gaps: SessionDiagnosticGap[] = []
  const ending = skeleton.terminal
  if (ending !== null && ending.outcome !== 'completed' && ending.end === null)
    gaps.push({ source: 'session', subject: skeleton.run, reason: 'not-recorded' })
  const calls = skeleton.calls.slice(0, projected)
  const facts = attributeFacts(skeleton, calls)
  const modelCalls: SessionModelCallDiagnostic[] = []
  const toolCalls: SessionToolCallDiagnostic[] = []
  for (const call of calls) {
    const own = facts.byCall.get(call.position) ?? []
    if (call.kind === 'model') {
      const one = modelCallOf(call, answers.models.get(call.position), own, answers.blocks)
      modelCalls.push(one.value)
      gaps.push(...one.gaps)
    } else {
      const one = toolCallOf(call, answers.tools.get(call.position), own)
      toolCalls.push(one.value)
      gaps.push(...one.gaps)
    }
  }
  if (projected < skeleton.calls.length)
    gaps.push({ source: 'session', subject: skeleton.run, reason: 'truncated' })
  const { terminal } = skeleton
  return {
    value: {
      run: skeleton.run,
      entry: skeleton.entry,
      execution: skeleton.execution,
      started: { position: skeleton.position, at: { kind: 'unknown' } },
      attempts: attemptsViewOf(skeleton.attempts),
      controls: skeleton.controls,
      terminal:
        terminal === null
          ? null
          : {
              outcome: terminal.outcome,
              cause: { record: terminal.record, structured: causeOf(terminal) },
            },
      calls: { registered: String(skeleton.calls.length), projected: String(projected) },
      modelCalls,
      toolCalls,
      messages: [...skeleton.messages].map(([kind, count]) => ({ kind, count: String(count) })),
      facts: facts.run,
    },
    gaps,
  }
}

export function undisclosedGaps(disclosed: readonly string[]): SessionDiagnosticGap[] {
  return PROJECTED_KINDS.filter(kind => !disclosed.includes(kind)).map(kind => ({
    source: 'session',
    subject: kind,
    reason: 'not-disclosed',
  }))
}
