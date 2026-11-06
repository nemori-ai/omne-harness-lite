// The pure projection (SPEC「会话诊断投影」): Session history entries become Run skeletons, and the
// answers of the other sources become the view values of one Run with its gaps. Nothing here calls
// a port, reads HTTP or knows Cordis. The skeleton of a Run comes from Session alone; a value a
// source did not give is `unknown` with the reason of that read, never "did not happen".
import type { FinishIntent } from '@omne-harness/agent-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Lookup,
  ModelAttemptDiagnostic,
  ModelDiagnosticsPage,
} from '@omne-harness/model-contract'
import type {
  SessionCallAccountView,
  SessionDiagnosticGap,
  SessionDiagnosticMilliseconds,
  SessionDiagnosticUnknown,
  SessionModelAttemptDiagnostic,
  SessionModelCallDiagnostic,
  SessionRunCause,
  SessionRunControl,
  SessionRunDiagnostic,
  SessionToolCallDiagnostic,
} from '@omne-harness/public-contract'
import type { HistoryEntry } from '@omne-harness/session-contract'
import type { ToolLookup } from '@omne-harness/tool-contract'
import type { CallAccount, SourceAnswer } from './sources.ts'

/** The entry kinds the projection reads (RFC-0013「数据来源与读取路径」). A deployment discloses a subset. */
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
const FIT_REASONS = ['fixed', 'after-compaction'] as const

// ---- reading the stored payload of an entry ----

function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

function textAt(value: JsonValue | undefined, ...path: readonly string[]): string | undefined {
  const found = path.reduce<JsonValue | undefined>(member, value)
  return found?.kind === 'string' ? found.value : undefined
}

function oneOf<T extends string>(value: string | undefined, set: readonly T[]): T | undefined {
  return set.find(item => item === value)
}

// ---- the Run skeleton ----

/**
 * One call of a Run, in log order of its first `call.bound`. `reference` is null for a registration
 * without one. `consumption` is the identity Session gives the call; null when the entry has none.
 */
export type CallRegistration = Readonly<{
  position: string
  consumption: string | null
  kind: 'model' | 'tool'
  reference: string | null
  purpose: string
}>
export type RunSkeleton = Readonly<{
  run: string
  execution: string
  entry: 'interactive' | 'dispatch'
  position: string
  attempts: number
  controls: readonly SessionRunControl[]
  terminal: Readonly<{
    outcome: 'completed' | 'failed' | 'cancelled'
    record: string | null
  }> | null
  calls: readonly CallRegistration[]
  messages: ReadonlyMap<string, number>
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

/**
 * `call.bound` has two shapes in the Session contract (`entries.ts`): the registration shape that
 * a live Run writes, with the producer under `registration.binding.producer`, and the older shape
 * with `binding`, `reference` and `purpose` at the top. The producer's `call` is the reference the
 * owner reads.
 */
function callOf(entry: HistoryEntry): CallRegistration | undefined {
  const { payload } = entry
  const registered = member(payload, 'registration')
  const producer = member(member(registered ?? payload, 'binding'), 'producer')
  const kind = oneOf(textAt(payload, 'kind') ?? textAt(producer, 'kind'), CALL_KINDS)
  if (kind === undefined) return undefined
  return {
    position: entry.id,
    consumption: textAt(payload, 'consumption') ?? null,
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
  attempts: number
  controls: SessionRunControl[]
  terminal: RunSkeleton['terminal']
  calls: CallRegistration[]
  messages: Map<string, number>
}

/**
 * A Tool call is two `call.bound` of one consumption (`frontier-state.ts` consequenceKind): the
 * `tool-intent` registration without a producer, then the association with it. They are one call:
 * the entry with the producer gives its values, the first registration its position.
 */
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

function fold(draft: Draft, entry: HistoryEntry): void {
  switch (entry.kind) {
    case 'run.attempt-started':
      draft.attempts += 1
      return
    case 'run.terminal': {
      const outcome = oneOf(textAt(entry.payload, 'terminal', 'outcome'), RUN_OUTCOMES)
      if (outcome !== undefined)
        draft.terminal = { outcome, record: textAt(entry.payload, 'cause', 'record') ?? null }
      return
    }
    case 'control.requested':
      draft.controls.push(controlOf(entry, 'requested'))
      return
    case 'control.progress':
      draft.controls.push(controlOf(entry, 'progress'))
      return
    case 'call.bound':
      registerCall(draft.calls, entry)
      return
    default:
      if (entry.kind.startsWith('message.'))
        draft.messages.set(entry.kind, (draft.messages.get(entry.kind) ?? 0) + 1)
  }
}

/** The skeleton of the Run that `started` opens, from the entries after it in log order. */
function skeletonOf(
  started: HistoryEntry,
  run: string,
  later: readonly HistoryEntry[],
): RunSkeleton {
  const draft: Draft = {
    attempts: 0,
    controls: [],
    terminal: null,
    calls: [],
    messages: new Map(),
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
  /** Feeds one entry, newest first. Returns true once the collector wants no more entries. */
  feed(entry: HistoryEntry): boolean
  runs(): readonly RunSkeleton[]
  /** The `run.started` entry the collection stopped at, when it stopped by its limit. */
  stoppedAt(): string | null
}>

/**
 * Collects Runs from entries fed newest first. Entries between two `run.started` belong to the
 * newer Run, so a Run closes when its own `run.started` arrives. `run` keeps one Run only; the
 * collector then stops at that Run. Without a filter it stops after `maxRuns` Runs.
 */
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

// ---- the view of one Run from the answers of the other sources ----

export type ModelAnswers = Readonly<{
  lookup: SourceAnswer<Lookup>
  /** Null when no call was found to list the attempts of. */
  attempts: SourceAnswer<ModelDiagnosticsPage> | null
}>
export type ToolAnswers = Readonly<{
  lookup: SourceAnswer<ToolLookup>
  account: SourceAnswer<CallAccount>
}>
export type RunAnswers = Readonly<{
  /** Null when the projection did not read the finish: the Run completed or has not ended. */
  finish: SourceAnswer<FinishIntent | null> | null
  models: ReadonlyMap<string, ModelAnswers>
  tools: ReadonlyMap<string, ToolAnswers>
}>
export type Projected<T> = Readonly<{ value: T; gaps: readonly SessionDiagnosticGap[] }>

const unknown = (reason: SessionDiagnosticUnknown['reason']): SessionDiagnosticUnknown => ({
  kind: 'unknown',
  reason,
})

function causeOf(finish: RunAnswers['finish']): SessionRunCause {
  if (finish === null) return { kind: 'none' }
  if (finish.kind === 'gap') return unknown(finish.reason)
  const intent = finish.value
  if (intent === null) return unknown('not-recorded')
  const { failure } = intent
  if (failure === null) return { kind: 'no-failure', conclusion: intent.conclusion.kind }
  switch (failure.kind) {
    case 'model-refused':
      return { kind: 'model-refused', failure: oneOf(failure.failure.kind, REFUSALS) ?? 'invalid' }
    case 'no-reply':
      return {
        kind: 'no-reply',
        cause: failure.fault?.cause ?? null,
        upstreamStatus: failure.fault?.upstreamStatus ?? null,
      }
    case 'cannot-fit':
      return { kind: 'cannot-fit', reason: oneOf(failure.reason, FIT_REASONS) ?? 'fixed' }
    default:
      return { kind: failure.kind }
  }
}

const millisecondsOf = (
  duration: ModelAttemptDiagnostic['timing']['execution'],
): SessionDiagnosticMilliseconds =>
  duration.kind === 'known'
    ? { kind: 'known', milliseconds: duration.milliseconds }
    : { kind: 'unknown' }

function attemptOf(attempt: ModelAttemptDiagnostic): SessionModelAttemptDiagnostic {
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
    timing: {
      materialize: millisecondsOf(attempt.timing.materialize),
      sendToFirstContent: millisecondsOf(attempt.timing.sendToFirstContent),
      execution: millisecondsOf(attempt.timing.execution),
    },
  }
}

function attemptsOf(
  reference: string,
  attempts: ModelAnswers['attempts'],
): Projected<Pick<SessionModelCallDiagnostic, 'dispatches' | 'coverage'>> {
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
  return { value: { dispatches: page.entries.map(attemptOf), coverage: page.coverage }, gaps }
}

function modelCallOf(
  call: CallRegistration,
  answers: ModelAnswers | undefined,
): Projected<SessionModelCallDiagnostic> {
  const reference = call.reference ?? call.position
  const base = { reference, purpose: call.purpose, usage: unknown('unsupported') } as const
  const lookup = answers?.lookup ?? { kind: 'gap', reason: 'not-recorded' }
  if (lookup.kind === 'gap')
    return {
      value: { ...base, call: unknown(lookup.reason), dispatches: [], coverage: 'unknown' },
      gaps: [{ source: 'model', subject: reference, reason: lookup.reason }],
    }
  if (lookup.value.kind === 'not-accepted')
    return {
      value: { ...base, call: unknown('not-accepted'), dispatches: [], coverage: 'unknown' },
      gaps: [{ source: 'model', subject: reference, reason: 'not-accepted' }],
    }
  const { state } = lookup.value
  const attempts = attemptsOf(reference, answers?.attempts ?? null)
  return {
    value: {
      ...base,
      call: { kind: 'found', call: state.call, phase: state.phase },
      ...attempts.value,
    },
    gaps: attempts.gaps,
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

function toolStateOf(lookup: ToolAnswers['lookup']): SessionToolCallDiagnostic['state'] {
  if (lookup.kind === 'gap') return unknown(lookup.reason)
  if (lookup.value.kind === 'not-accepted') return unknown('not-accepted')
  const { state } = lookup.value
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

function toolCallOf(
  call: CallRegistration,
  answers: ToolAnswers | undefined,
): Projected<SessionToolCallDiagnostic> {
  const reference = call.reference ?? call.position
  const lookup = answers?.lookup ?? { kind: 'gap', reason: 'not-recorded' }
  const account = answers?.account ?? { kind: 'gap', reason: 'not-recorded' }
  const gaps: SessionDiagnosticGap[] = []
  if (lookup.kind === 'gap')
    gaps.push({ source: 'tool', subject: reference, reason: lookup.reason })
  else if (lookup.value.kind === 'not-accepted')
    gaps.push({ source: 'tool', subject: reference, reason: 'not-accepted' })
  if (account.kind === 'gap')
    gaps.push({ source: 'tool', subject: reference, reason: account.reason })
  return {
    value: {
      reference,
      state: toolStateOf(lookup),
      account: account.kind === 'gap' ? unknown(account.reason) : accountViewOf(account.value),
      diagnostics: 'unsupported',
    },
    gaps,
  }
}

/** The view of one Run. `projected` is how many of its calls entered the fan-out (the Run's `maxCallsPerRun` prefix). */
export function projectRun(
  skeleton: RunSkeleton,
  projected: number,
  answers: RunAnswers,
): Projected<SessionRunDiagnostic> {
  const gaps: SessionDiagnosticGap[] = []
  if (answers.finish?.kind === 'gap')
    gaps.push({ source: 'agent', subject: skeleton.execution, reason: answers.finish.reason })
  else if (answers.finish?.kind === 'value' && answers.finish.value === null)
    gaps.push({ source: 'agent', subject: skeleton.execution, reason: 'not-recorded' })
  const modelCalls: SessionModelCallDiagnostic[] = []
  const toolCalls: SessionToolCallDiagnostic[] = []
  for (const call of skeleton.calls.slice(0, projected)) {
    if (call.kind === 'model') {
      const one = modelCallOf(call, answers.models.get(call.position))
      modelCalls.push(one.value)
      gaps.push(...one.gaps)
    } else {
      const one = toolCallOf(call, answers.tools.get(call.position))
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
      attempts: String(skeleton.attempts),
      controls: skeleton.controls,
      terminal:
        terminal === null
          ? null
          : {
              outcome: terminal.outcome,
              cause: { record: terminal.record, structured: causeOf(answers.finish) },
            },
      calls: { registered: String(skeleton.calls.length), projected: String(projected) },
      modelCalls,
      toolCalls,
      messages: [...skeleton.messages].map(([kind, count]) => ({ kind, count: String(count) })),
    },
    gaps,
  }
}

/** The kinds of the projection that the deployment does not disclose, as gaps. */
export function undisclosedGaps(disclosed: readonly string[]): SessionDiagnosticGap[] {
  return PROJECTED_KINDS.filter(kind => !disclosed.includes(kind)).map(kind => ({
    source: 'session',
    subject: kind,
    reason: 'not-disclosed',
  }))
}
