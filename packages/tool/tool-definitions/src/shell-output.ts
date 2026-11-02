import type {
  CommandOutcome,
  OutputChunk,
  ProcessHandle,
} from '@omne-harness/execution-environment-contract'
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
): Promise<string> {
  const streams = new Map<Stream, StreamState>()
  let stop: Promise<'confirmed' | 'unconfirmed'> | undefined
  const cancel = () => {
    stop ??= handle.stop('forced').catch(() => 'unconfirmed')
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  let outcome: CommandOutcome | undefined
  try {
    const readFailure = await drainOutput(handle, streams, maximum)
    try {
      outcome = await handle.result
    } catch {
      outcome = undefined
    }
    const stopped = stop === undefined ? 'not-requested' : await stop
    const status =
      outcome?.kind === 'completed' && !readFailure && !signal.aborted ? 'done' : 'unknown'
    const metadata = `${status} process=${JSON.stringify(handle.process)} output_mode=${handle.outputMode} stop=${stopped}\n${outcomeText(outcome)}${readFailure ? '\noutput_reader=unknown' : ''}\n`
    const allowance = Math.max(0, maximum - utf8Length(metadata))
    const sections = [...streams.entries()]
    const perStream = Math.max(0, Math.floor(allowance / Math.max(1, sections.length)))
    const body = sections
      .map(([stream, state]) => {
        const header = `${stream} facility_gaps=${state.gaps.render(Math.floor(perStream / 3)) || 'none'} discarded_observed_bytes=${state.discarded}\n`
        return header + state.text.render(Math.max(0, perStream - utf8Length(header) - 1)) + '\n'
      })
      .join('')
    return bounded(metadata + body, maximum)
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}
async function drainOutput(
  handle: ProcessHandle,
  streams: Map<Stream, StreamState>,
  maximum: number,
): Promise<boolean> {
  try {
    for await (const chunk of handle.output) appendChunk(streams, chunk, maximum)
    for (const state of streams.values()) state.text.append(state.decoder.decode())
    return false
  } catch {
    return true
  }
}
function appendChunk(streams: Map<Stream, StreamState>, chunk: OutputChunk, maximum: number): void {
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
  state.text.append(state.decoder.decode(chunk.data, { stream: true }))
  state.next = chunk.observedOffset + chunk.data.byteLength
}
function outcomeText(outcome: CommandOutcome | undefined): string {
  if (outcome === undefined) return 'outcome=unknown'
  const ending =
    outcome.kind === 'completed'
      ? `completed exit=${JSON.stringify(outcome.exit)} duration_ms=${outcome.durationMs}`
      : `unknown reason=${outcome.reason} observed_duration_ms=${outcome.observedDurationMs}`
  const summary = outcome.output
  const streams =
    summary.mode === 'terminal'
      ? [['terminal', summary.terminal] as const]
      : [['stdout', summary.stdout] as const, ['stderr', summary.stderr] as const]
  return `${ending}\n${streams.map(([name, count]) => `${name} observed_bytes=${count.observedBytes} facility_discarded_bytes=${count.discardedBytes}`).join('\n')}`
}
