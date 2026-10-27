import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  OutputChunk,
  OutputCount,
  OutputSummary,
  ProcessHandle,
} from '../index.ts'

export type ScriptedCommandAnswer =
  | Readonly<{
      kind: 'started'
      /** Chunks in order. `observedOffset` is counted per stream. Strings are UTF-8 encoded. */
      output?: readonly Readonly<{ stream: OutputChunk['stream']; data: string | Uint8Array }>[]
      /** Default: completed, exit code 0, `durationMs` 0, counts from `output`. */
      outcome?: CommandOutcome
      /** `untilStop`: output stays open and `result` waits until a confirmed stop. Default `exit`. */
      runs?: 'exit' | 'untilStop'
      /** What `stop` answers. Default `confirmed`. */
      stop?: 'confirmed' | 'unconfirmed'
    }>
  | Readonly<{ kind: 'rejected'; reason: FacilityReason }>
  | Readonly<{ kind: 'unknown' }>

type StartRequest<P> = Parameters<CommandFacility<P>['start']>[0]

export type CommandScript<P = unknown> = (
  request: StartRequest<P>,
) => ScriptedCommandAnswer | Promise<ScriptedCommandAnswer>

export type ScriptedCommandFacility<P = unknown> = Readonly<{
  durability: 'none'
  /** The facility to put in a scripted lease: `lease: { command: cmd.facility }`. */
  facility: CommandFacility<P>
  calls: readonly StartRequest<P>[]
  stops: readonly Readonly<{
    process: ProcessHandle['process']
    mode: 'graceful' | 'forced'
    answer: 'confirmed' | 'unconfirmed'
  }>[]
  /** After `close`, `start` answers `rejected/closed` without calling the script. Running processes go on. */
  close(): void
}>

type Started = Extract<ScriptedCommandAnswer, { kind: 'started' }>

/** Turns the scripted chunks into output chunks. A stream that the output mode lacks is a script error. */
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

/**
 * The one reader of a process output. After the chunks it waits for the process to end. `return()`
 * gives up the read right only: a pending `next()` ends, and the process goes on.
 */
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

/**
 * A scripted command facility for tests. The script answers each accepted `start`. It starts no real
 * process and reads nothing from the host. Not durable; never assemble in production.
 */
export function createScriptedCommandFacility<P = unknown>(
  script: CommandScript<P>,
): ScriptedCommandFacility<P> {
  let processes = 0
  let closed = false
  const calls: StartRequest<P>[] = []
  const stops: {
    process: ProcessHandle['process']
    mode: 'graceful' | 'forced'
    answer: 'confirmed' | 'unconfirmed'
  }[] = []

  function processOf(request: StartRequest<P>, answer: Started): ProcessHandle {
    const mode = request.outputMode
    const chunks = chunksOf(answer, mode)
    const identity = { id: `scripted-${++processes}`, generation: '1' }
    const ended = Promise.withResolvers<CommandOutcome>()
    const outcomeAfter = (stop: 'graceful' | 'forced' | null): CommandOutcome =>
      answer.outcome ?? {
        kind: 'completed',
        exit:
          stop === null
            ? { kind: 'code', code: 0 }
            : { kind: 'signal', signal: stop === 'graceful' ? 'SIGTERM' : 'SIGKILL' },
        durationMs: 0,
        output: summaryOf(chunks, mode),
      }
    let running = answer.runs === 'untilStop'
    let taken = false
    if (!running) ended.resolve(outcomeAfter(null))
    return {
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
        stops.push({ process: identity, mode: stopMode, answer: reply })
        if (running && reply === 'confirmed') {
          running = false
          ended.resolve(outcomeAfter(stopMode))
        }
        return reply
      },
    }
  }

  const facility: CommandFacility<P> = {
    async start(request) {
      if (closed) return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
      calls.push(request)
      const answer = await script(request)
      switch (answer.kind) {
        case 'started':
          return { kind: 'done', requestId: request.requestId, value: processOf(request, answer) }
        case 'rejected':
          return { kind: 'rejected', requestId: request.requestId, reason: answer.reason }
        case 'unknown':
          return { kind: 'unknown', requestId: request.requestId }
        default: {
          const exhaustive: never = answer
          return exhaustive
        }
      }
    },
  }

  return {
    durability: 'none',
    facility,
    calls,
    stops,
    close() {
      closed = true
    },
  }
}
