import type {
  BetweenSegments,
  CommandOutcome,
  OutputChunk,
  ProcessHandle,
  ResidueReport,
} from '@omne-harness/execution-environment-contract'
import type { Answer } from './program-side.ts'
import type { OutputStage } from './shell-staging.ts'
import { bounded, TextWindow, utf8Length } from './text.ts'

type Stream = OutputChunk['stream']
type StreamState = {
  readonly text: TextWindow
  decoder: InstanceType<typeof TextDecoder>
  next: number
  gaps: TextWindow
  discarded: number
}
export async function collectProcess(
  handle: ProcessHandle,
  signal: AbortSignal,
  maximum: number,
  stage: OutputStage | null = null,
): Promise<Answer> {
  const result = handle.result.catch(() => undefined)
  const streams = new Map<Stream, StreamState>()
  let stop: Promise<'confirmed' | 'unconfirmed'> | undefined
  const cancel = () => {
    stop ??= handle.stop('forced').catch(() => 'unconfirmed')
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  try {
    const readFailure = await drainOutput(handle, streams, maximum, stage)
    const outcome = await result
    const stopped = stop === undefined ? 'not-requested' : await stop
    const staged = stage === null ? '' : await stage.finish()
    const status =
      outcome?.kind === 'completed' && !readFailure && !signal.aborted ? 'done' : 'unknown'
    const metadata = `${status} process=${JSON.stringify(handle.process)} output_mode=${handle.outputMode} stop=${stopped}\n${outcomeText(outcome)}${readFailure ? '\noutput_reader=unknown' : ''}\n${staged}`
    const allowance = Math.max(0, maximum - utf8Length(metadata))
    const sections = [...streams.entries()]
    const between = betweenOf(outcome)
    const parts = sections.length + (between === undefined ? 0 : 1)
    const perStream = Math.max(0, Math.floor(allowance / Math.max(1, parts)))
    const prefix = between === undefined ? '' : betweenSection(between, perStream, maximum)
    const body = sections
      .map(([stream, state]) => {
        const header = `${stream} facility_gaps=${state.gaps.render(Math.floor(perStream / 3)) || 'none'} discarded_observed_bytes=${state.discarded}\n`
        return header + state.text.render(Math.max(0, perStream - utf8Length(header) - 1)) + '\n'
      })
      .join('')
    const text = bounded(metadata + prefix + body, maximum)
    const data = status === 'done' ? valueOf(outcome, streams) : undefined
    return data === undefined ? { text } : { text, data }
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}
/** What a one-shot run gives a program: its exit and both streams, only when every byte was kept. */
function valueOf(outcome: CommandOutcome | undefined, streams: ReadonlyMap<Stream, StreamState>) {
  if (outcome?.kind !== 'completed' || outcome.output.mode !== 'separate') return undefined
  const { output } = outcome
  const kept = (stream: 'stdout' | 'stderr') => {
    const state = streams.get(stream)
    if (output[stream].discardedBytes > 0 || (state?.discarded ?? 0) > 0) return null
    return state === undefined ? '' : state.text.whole()
  }
  const stdout = kept('stdout')
  const stderr = kept('stderr')
  if (stdout === null || stderr === null) return undefined
  const { exit } = outcome
  return {
    exit_code: exit.kind === 'code' ? exit.code : null,
    signal: exit.kind === 'signal' ? exit.signal : null,
    stdout,
    stderr,
    duration_ms: outcome.durationMs,
  }
}
async function drainOutput(
  handle: ProcessHandle,
  streams: Map<Stream, StreamState>,
  maximum: number,
  stage: OutputStage | null,
): Promise<boolean> {
  try {
    for await (const chunk of handle.output) stage?.observe(appendChunk(streams, chunk, maximum))
    for (const state of streams.values()) {
      const rest = state.decoder.decode()
      state.text.append(rest)
      stage?.observe(rest)
    }
    return false
  } catch {
    return true
  }
}
/** Keeps a chunk in its stream window and gives back its decoded text. */
function appendChunk(
  streams: Map<Stream, StreamState>,
  chunk: OutputChunk,
  maximum: number,
): string {
  let state = streams.get(chunk.stream)
  if (state === undefined) {
    state = {
      text: new TextWindow(maximum),
      decoder: new TextDecoder('utf-8', { ignoreBOM: true }),
      next: 0,
      gaps: new TextWindow(maximum),
      discarded: 0,
    }
    streams.set(chunk.stream, state)
  }
  if (chunk.observedOffset !== state.next) {
    state.gaps.append(`${state.next}..${chunk.observedOffset},`)
    state.discarded += Math.max(0, chunk.observedOffset - state.next)
    state.decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  }
  const text = state.decoder.decode(chunk.data, { stream: true })
  state.text.append(text)
  state.next = chunk.observedOffset + chunk.data.byteLength
  return text
}
function outcomeText(outcome: CommandOutcome | undefined): string {
  if (outcome === undefined) return 'outcome=unknown'
  const ending =
    outcome.kind === 'completed'
      ? `completed exit=${JSON.stringify(outcome.exit)} duration_ms=${outcome.durationMs}`
      : `unknown reason=${outcome.reason} observed_duration_ms=${outcome.observedDurationMs}`
  const summary = outcome.output
  const residue = outcome.kind === 'completed' ? residueLine(outcome.residue) : undefined
  const streams =
    summary.mode === 'terminal'
      ? [['terminal', summary.terminal] as const]
      : [['stdout', summary.stdout] as const, ['stderr', summary.stderr] as const]
  const between = betweenOf(outcome)
  const lines = [
    ...(residue === undefined ? [] : [residue]),
    ...streams.map(
      ([name, count]) =>
        `${name} observed_bytes=${count.observedBytes} facility_discarded_bytes=${count.discardedBytes}`,
    ),
    ...(between === undefined
      ? []
      : [
          `between_segments observed_bytes=${between.count.observedBytes} facility_discarded_bytes=${between.count.discardedBytes}`,
        ]),
  ]
  return `${ending}\n${lines.join('\n')}`
}
function residueLine(residue: ResidueReport | undefined): string | undefined {
  switch (residue?.kind) {
    case undefined:
      return undefined
    case 'none':
      return 'residue=none'
    case 'retained':
      return `residue=retained process=${JSON.stringify(residue.process)} processes=${residue.processes}`
    case 'stopping':
      return `residue=stopping reason=${residue.reason}`
    case 'unknown':
      return 'residue=unknown'
    default: {
      const exhaustive: never = residue
      return exhaustive
    }
  }
}
function betweenOf(outcome: CommandOutcome | undefined): BetweenSegments | undefined {
  const summary = outcome?.output
  if (summary?.mode !== 'terminal' || summary.between === undefined) return undefined
  return summary.between.count.observedBytes > 0 ? summary.between : undefined
}
function betweenSection(between: BetweenSegments, budget: number, maximum: number): string {
  const header = `between_segments facility_discarded_bytes=${between.count.discardedBytes}\n`
  const text = new TextWindow(maximum)
  text.append(new TextDecoder('utf-8', { ignoreBOM: true }).decode(between.data))
  return header + text.render(Math.max(0, budget - utf8Length(header) - 1)) + '\n'
}
