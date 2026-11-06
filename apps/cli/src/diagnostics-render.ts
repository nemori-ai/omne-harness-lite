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
  SessionToolDiagnosticEntry,
} from '@omne-harness/sdk'

function at(depth: number, line: string): string {
  return `${'  '.repeat(depth)}${line}`
}

/**
 * A value the projection could not read, with the reason of that read. The reason is in
 * parentheses, so `unknown (unsupported)` is not read as two words of a closed field.
 */
function unknown(value: SessionDiagnosticUnknown): string {
  return `unknown (${value.reason})`
}

/** A closed field that may be `unknown`. */
function closedOrUnknown(value: string | SessionDiagnosticUnknown): string {
  return typeof value === 'string' ? value : unknown(value)
}

function milliseconds(value: SessionDiagnosticMilliseconds): string {
  return value.kind === 'known' ? `${value.milliseconds} ms` : 'unknown'
}

/**
 * The `reason:` line of a Run that ended: the closed kind of Agent's finish candidate and its
 * closed fields, so the words of the owner are the words a person reads. `none` is a completed Run
 * whose finish the projection did not read; it has no reason line.
 */
function reasonOf(cause: SessionRunCause): string | undefined {
  switch (cause.kind) {
    case 'none':
      return undefined
    case 'unknown':
      return unknown(cause)
    case 'no-failure':
      return `no-failure ${cause.conclusion}`
    case 'model-refused':
      return `model-refused ${closedOrUnknown(cause.failure)}`
    case 'no-reply':
      return `no-reply ${cause.cause ?? 'unknown'} ${cause.upstreamStatus ?? 'unknown'}`
    case 'cannot-fit':
      return `cannot-fit ${closedOrUnknown(cause.reason)}`
    default:
      // The kinds without fields (`request-rejected`, `guard`, ...) are their name.
      return cause.kind
  }
}

function attemptOutcome(outcome: SessionModelAttemptDiagnostic['outcome']): string {
  switch (outcome.kind) {
    case 'pending':
    case 'interrupted':
      return outcome.kind
    case 'completed':
      return `completed ${outcome.reason}`
    case 'failed':
      return `failed ${outcome.cause} http ${outcome.upstreamStatus ?? 'unknown'}`
    default: {
      const exhaustive: never = outcome
      return exhaustive
    }
  }
}

/** One usage or cost item: its name, its number or `unknown`, its unit and its state. */
function amount(
  name: string,
  item: { readonly unit: string; readonly state: string; readonly lexeme: string | null },
): string {
  return `${name} ${item.lexeme ?? 'unknown'} ${item.unit} ${item.state}`
}

/** The `account:` line of a model dispatch or a tool call. */
function accountLine(view: SessionCallAccountView | SessionDiagnosticUnknown): string {
  if (view.kind === 'unknown') return `account: ${unknown(view)}`
  const usage = view.usage.map(item => amount(item.name, item)).join(', ') || 'none'
  const cost = view.cost.map(item => amount(item.source, item)).join(', ') || 'none'
  const duration = view.duration.kind === 'known' ? view.duration.value : 'unknown'
  return `account: ${usage}; cost: ${cost}; duration ${duration}; receipt ${view.receipt}`
}

/** `facts: <kind> <count>, ...` of a Run or a call; nothing when it has no execution fact. */
function factsLines(depth: number, facts: readonly SessionFactCount[]): string[] {
  if (facts.length === 0) return []
  return [at(depth, `facts: ${facts.map(fact => `${fact.kind} ${fact.count}`).join(', ')}`)]
}

/** The released reasons in the order of the contract, not in the key order of the body. */
const releasedReasons = [
  'ended',
  'bounded',
  'cancelled',
  'released',
  'superseded',
] as const satisfies readonly (keyof SessionRunAttempts['released'])[]

/**
 * `attempts: <started>`, and after it in parentheses each released reason and the exits whose
 * count is not zero: `attempts: 2 (released: ended 1, superseded 1; exited 1)`.
 */
function attemptsLine(attempts: SessionRunAttempts): string {
  const released = releasedReasons
    .filter(reason => attempts.released[reason] !== '0')
    .map(reason => `${reason} ${attempts.released[reason]}`)
  const parts = [
    ...(released.length === 0 ? [] : [`released: ${released.join(', ')}`]),
    ...(attempts.exited === '0' ? [] : [`exited ${attempts.exited}`]),
  ]
  return at(1, `attempts: ${attempts.started}${parts.length === 0 ? '' : ` (${parts.join('; ')})`}`)
}

function renderDispatch(attempt: SessionModelAttemptDiagnostic): string[] {
  const { timing } = attempt
  return [
    at(
      3,
      `${attempt.dispatch} ${attempt.adapter.name}: ${attempt.send}, first content ${attempt.firstContent}, ${attemptOutcome(attempt.outcome)}`,
    ),
    at(
      4,
      `timing: materialize ${milliseconds(timing.materialize)}, send to first content ${milliseconds(timing.sendToFirstContent)}, execution ${milliseconds(timing.execution)}`,
    ),
    at(4, accountLine(attempt.account)),
  ]
}

function renderModelCall(call: SessionModelCallDiagnostic): string[] {
  const resolved =
    call.call.kind === 'found'
      ? `call ${call.call.call} (${call.call.phase})`
      : `call ${unknown(call.call)}`
  const dispatches = call.dispatches.length
  return [
    at(
      2,
      `${call.purpose} ${call.reference} -> ${resolved}, ${dispatches} ${dispatches === 1 ? 'dispatch' : 'dispatches'}, coverage ${call.coverage}`,
    ),
    ...call.dispatches.flatMap(renderDispatch),
    ...factsLines(3, call.facts),
  ]
}

function renderToolCall(call: SessionToolCallDiagnostic): string[] {
  const { state } = call
  const resolved =
    state.kind === 'found'
      ? `call ${state.call} (${state.phase}, ${state.relation}), ${
          state.terminal === null
            ? 'not ended'
            : `${state.terminal.kind}${state.terminal.cause === null ? '' : ` ${state.terminal.cause}`}`
        }`
      : `call ${unknown(state)}`
  return [
    at(2, `${call.reference} -> ${resolved}`),
    at(3, accountLine(call.account)),
    ...factsLines(3, call.facts),
    ...toolDiagnosticsLines(call.diagnostics),
  ]
}

/** `diagnostics: <n>` and one line per entry, or `diagnostics: unknown (<reason>)`. */
function toolDiagnosticsLines(
  diagnostics: readonly SessionToolDiagnosticEntry[] | SessionDiagnosticUnknown,
): string[] {
  if ('kind' in diagnostics) return [at(3, `diagnostics: ${unknown(diagnostics)}`)]
  return [
    at(3, `diagnostics: ${diagnostics.length}`),
    ...diagnostics.map(entry => at(4, `${entry.operation} ${entry.phase} ${entry.code}`)),
  ]
}

function renderControl(control: SessionRunControl): string {
  return at(
    1,
    `control ${control.kind} at ${control.position}: ${control.target ?? '-'} ${control.intent ?? '-'} ${control.state ?? '-'}`,
  )
}

/**
 * The text a person reads for one Run: a header with how it ended, its attempts, the recorded
 * cause and its reason, each control, each model call with its dispatches and their accounts, each
 * tool call with its account and diagnostics, the message counts and the execution facts. A value a source did not give reads `unknown` with the reason of that read.
 */
function renderRun(run: SessionRunDiagnostic): string[] {
  const { terminal } = run
  const reason = terminal === null ? undefined : reasonOf(terminal.cause.structured)
  const record = terminal?.cause.record ?? null
  const started = run.started.at.kind === 'known' ? run.started.at.instant : 'unknown'
  const messages = run.messages.map(entry => `${entry.kind} ${entry.count}`).join(', ')
  return [
    `Run ${run.run} (entry ${run.entry}, execution ${run.execution}): ${terminal?.outcome ?? 'not ended'}`,
    at(1, `started: position ${run.started.position} at ${started}`),
    attemptsLine(run.attempts),
    ...(record === null ? [] : [at(1, `cause: ${record}`)]),
    ...(reason === undefined ? [] : [at(1, `reason: ${reason}`)]),
    ...run.controls.map(renderControl),
    at(1, `model calls: ${run.modelCalls.length}`),
    ...run.modelCalls.flatMap(renderModelCall),
    at(1, `tool calls: ${run.toolCalls.length}`),
    ...run.toolCalls.flatMap(renderToolCall),
    ...(messages === '' ? [] : [at(1, `messages: ${messages}`)]),
    ...factsLines(1, run.facts),
  ]
}

/** The gaps of the whole read, one line each, after the Runs. Nothing when there is no gap. */
function renderGaps(gaps: readonly SessionDiagnosticGap[]): string[] {
  if (gaps.length === 0) return []
  return [
    `gaps: ${gaps.length}`,
    ...gaps.map(gap => at(1, `${gap.source} ${gap.subject}: ${gap.reason}`)),
  ]
}

/** The whole text: one block for each Run in page order, then the gaps. Empty when there is neither. */
export function renderDiagnostics(
  runs: readonly SessionRunDiagnostic[],
  gaps: readonly SessionDiagnosticGap[],
): string {
  const lines = [...runs.flatMap(renderRun), ...renderGaps(gaps)]
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}
