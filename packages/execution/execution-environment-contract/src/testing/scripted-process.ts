import type {
  CommandOutcome,
  OutputChunk,
  OutputCount,
  OutputSummary,
  ProcessHandle,
} from '../index.ts'
import type { ScriptedCommandAnswer } from './scripted-command.ts'

type Started = Extract<ScriptedCommandAnswer, { kind: 'started' }>
export type ScriptedStopRecord = Readonly<{
  process: ProcessHandle['process']
  mode: 'graceful' | 'forced'
  answer: 'confirmed' | 'unconfirmed'
}>
export type ScriptedProcess = Readonly<{
  handle: ProcessHandle
  settled: boolean
  complete(): void
}>

function chunksOf(answer: Started, mode: ProcessHandle['outputMode']): readonly OutputChunk[] {
  const observed = new Map<OutputChunk['stream'], number>()
  return (answer.output ?? []).map(({ stream, data }) => {
    if ((mode === 'terminal') !== (stream === 'terminal'))
      throw new TypeError(`scripted command: a ${stream} chunk in ${mode} output mode`)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data.slice()
    const observedOffset = observed.get(stream) ?? 0
    observed.set(stream, observedOffset + bytes.length)
    return { stream, data: bytes, observedOffset }
  })
}

function summaryOf(
  chunks: readonly OutputChunk[],
  mode: ProcessHandle['outputMode'],
): OutputSummary {
  const count = (stream: OutputChunk['stream']): OutputCount => ({
    observedBytes: chunks
      .filter(chunk => chunk.stream === stream)
      .reduce((sum, chunk) => sum + chunk.data.length, 0),
    discardedBytes: 0,
  })
  return mode === 'terminal'
    ? { mode: 'terminal', terminal: count('terminal') }
    : { mode: 'separate', stdout: count('stdout'), stderr: count('stderr') }
}

function reader(
  chunks: readonly OutputChunk[],
  ended: Promise<CommandOutcome>,
): AsyncIterator<OutputChunk> {
  let index = 0
  const released = Promise.withResolvers<void>()
  let open = true
  const finished = { done: true, value: undefined } as const
  return {
    async next() {
      const chunk = open ? chunks[index] : undefined
      if (chunk) {
        index++
        return { done: false, value: { ...chunk, data: chunk.data.slice() } }
      }
      if (open) await Promise.race([ended, released.promise])
      return finished
    },
    async return() {
      open = false
      released.resolve()
      return finished
    },
  }
}

export function createScriptedProcess({
  mode,
  answer,
  identity,
  onStop,
}: {
  mode: ProcessHandle['outputMode']
  answer: Started
  identity: ProcessHandle['process']
  onStop(record: ScriptedStopRecord): void
}): ScriptedProcess {
  const chunks = chunksOf(answer, mode)
  if (answer.outcome && answer.outcome.output.mode !== mode)
    throw new TypeError(
      `scripted command: a ${answer.outcome.output.mode} outcome in ${mode} output mode`,
    )
  const ended = Promise.withResolvers<CommandOutcome>()
  let settled = false
  function complete(stop: 'graceful' | 'forced' | null = null): void {
    if (settled) return
    settled = true
    ended.resolve(
      answer.outcome ?? {
        kind: 'completed',
        exit:
          stop === null
            ? { kind: 'code', code: 0 }
            : { kind: 'signal', signal: stop === 'graceful' ? 'SIGTERM' : 'SIGKILL' },
        durationMs: 0,
        output: summaryOf(chunks, mode),
      },
    )
  }
  if (answer.runs !== 'untilStop') complete()
  let taken = false
  const handle: ProcessHandle = {
    process: identity,
    outputMode: mode,
    outputPolicy: {
      maxBufferedBytes: Number.MAX_SAFE_INTEGER,
      maxChunkBytes: Number.MAX_SAFE_INTEGER,
      overflow: 'discard',
    },
    output: {
      [Symbol.asyncIterator]() {
        if (taken) throw new TypeError('scripted command: the output has one reader only')
        taken = true
        return reader(chunks, ended.promise)
      },
    },
    result: ended.promise,
    async stop(stopMode) {
      const reply = answer.stop ?? 'confirmed'
      onStop({ process: identity, mode: stopMode, answer: reply })
      if (!settled && reply === 'confirmed') complete(stopMode)
      return reply
    },
  }
  return {
    handle,
    get settled() {
      return settled
    },
    complete,
  }
}
