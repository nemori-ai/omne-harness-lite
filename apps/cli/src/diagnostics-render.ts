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
} from '@omne-harness/sdk'

function at(depth: number, line: string): string {
  return `${'  '.repeat(depth)}${line}`
}

function unknown(value: SessionDiagnosticUnknown): string {
  return `unknown ${value.reason}`
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
      return `model-refused ${cause.failure}`
    case 'no-reply':
      return `no-reply ${cause.cause ?? 'unknown'} ${cause.upstreamStatus ?? 'unknown'}`
    case 'cannot-fit':
      return `cannot-fit ${cause.reason}`
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

/** One usage or cost item: its number and unit, or `unknown`; the state when it is not `known`. */
function amount(
  name: string,
  item: { readonly unit: string; readonly state: string; readonly lexeme: string | null },
): string {
  if (item.lexeme === null)
    return item.state === 'unknown' ? `${name} unknown` : `${name} unknown ${item.state}`
  const shown = `${name} ${item.lexeme} ${item.unit}`
  return item.state === 'known' ? shown : `${shown} ${item.state}`
}

function account(view: SessionCallAccountView): string {
  const usage = view.usage.map(item => amount(item.name, item)).join(', ') || 'none'
  const cost = view.cost.map(item => amount(item.source, item)).join(', ') || 'none'
  const duration = view.duration.kind === 'known' ? view.duration.value : 'unknown'
  return `${usage}; cost: ${cost}; duration ${duration}; receipt ${view.receipt}`
}

function accountLine(
  label: string,
  view: SessionCallAccountView | SessionDiagnosticUnknown,
): string {
  return `${label}: ${view.kind === 'account' ? account(view) : unknown(view)}`
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
    at(3, accountLine('usage', call.usage)),
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
  return [at(2, `${call.reference} -> ${resolved}`), at(3, accountLine('account', call.account))]
}

function renderControl(control: SessionRunControl): string {
  return at(
    1,
    `control ${control.kind} at ${control.position}: ${control.target ?? '-'} ${control.intent ?? '-'} ${control.state ?? '-'}`,
  )
}

/**
 * The text a person reads for one Run: a header with how it ended, the recorded cause and its
 * reason, each control, each model and tool call with its dispatches and account, and the message
 * counts. A value a source did not give reads `unknown` with the reason of that read.
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
    ...(record === null ? [] : [at(1, `cause: ${record}`)]),
    ...(reason === undefined ? [] : [at(1, `reason: ${reason}`)]),
    ...run.controls.map(renderControl),
    at(1, `model calls: ${run.modelCalls.length}`),
    ...run.modelCalls.flatMap(renderModelCall),
    at(1, `tool calls: ${run.toolCalls.length}`),
    ...run.toolCalls.flatMap(renderToolCall),
    ...(messages === '' ? [] : [at(1, `messages: ${messages}`)]),
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
