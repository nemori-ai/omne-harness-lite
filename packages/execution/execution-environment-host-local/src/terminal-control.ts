export type TerminalFrame =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'opened'; cwd: string }>
  | Readonly<{ kind: 'started'; leg: string }>
  /** Between-segment bytes the gate kept before it read this leg's begin sentinel. */
  | Readonly<{ kind: 'between'; leg: string; bytes: Uint8Array }>
  /** The gate read this leg's begin sentinel; `discarded` between-segment bytes did not fit the bound. */
  | Readonly<{ kind: 'begun'; leg: string; discarded: number }>
  | Readonly<{ kind: 'data'; leg: string; bytes: Uint8Array }>
  | Readonly<{ kind: 'finished'; leg: string; code: number; cwd: string }>
  | Readonly<{ kind: 'fault' }>

type FrameOf<K extends TerminalFrame['kind']> = Extract<TerminalFrame, { kind: K }>
/**
 * The frames one push accepted, in order. A fault keeps the frames accepted before the refused
 * line of the same push: they happened, and how the bytes were cut must not change the outcome.
 */
type FrameStep = Readonly<{ kind: 'frames' | 'fault'; frames: readonly TerminalFrame[] }>
const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

function decode(
  value: unknown,
  generation: string,
  maxChunkBytes: number,
): TerminalFrame | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    Reflect.get(value, 'generation') !== generation
  )
    return undefined
  const kind: unknown = Reflect.get(value, 't')
  if (kind === 'ready' || kind === 'fault') return { kind }
  const cwd: unknown = Reflect.get(value, 'cwd')
  if (kind === 'opened')
    return typeof cwd === 'string' && cwd.startsWith('/') ? { kind, cwd } : undefined
  const leg: unknown = Reflect.get(value, 'leg')
  if (typeof leg !== 'string' || leg === '') return undefined
  if (kind === 'started') return { kind, leg }
  if (kind === 'begun') {
    const discarded: unknown = Reflect.get(value, 'discarded')
    return typeof discarded === 'number' && Number.isSafeInteger(discarded) && discarded >= 0
      ? { kind, leg, discarded }
      : undefined
  }
  if (kind === 'finished') {
    const code: unknown = Reflect.get(value, 'code')
    return typeof code === 'number' &&
      Number.isSafeInteger(code) &&
      code >= 0 &&
      code <= 255 &&
      typeof cwd === 'string' &&
      cwd.startsWith('/')
      ? { kind, leg, code, cwd }
      : undefined
  }
  if (kind !== 'data' && kind !== 'between') return undefined
  const text: unknown = Reflect.get(value, 'b')
  if (typeof text !== 'string' || !base64.test(text)) return undefined
  const bytes = new Uint8Array(Buffer.from(text, 'base64'))
  return bytes.length <= maxChunkBytes ? { kind, leg, bytes } : undefined
}

export function createTerminalReader(input: {
  generation: string
  maxChunkBytes: number
  maxControlBytes: number
  betweenSegmentBytes: number
}) {
  let pending = Buffer.alloc(0)
  let state: 'launching' | 'ready' | 'idle' | 'starting' | 'running' | 'fault' = 'launching'
  let leg: string | undefined
  // The PTY and the observation FIFO are not ordered against each other, so the begin
  // sentinel may be read before or after the started observation.
  let begun = false
  let between = 0
  const fault = (frames: readonly TerminalFrame[] = []): FrameStep => {
    state = 'fault'
    return { kind: 'fault', frames }
  }
  const inLeg = () => state === 'starting' || state === 'running'
  const enter = (from: typeof state, to: typeof state): boolean => {
    if (state !== from) return false
    state = to
    return true
  }
  const ofLeg = (id: string) => id === leg
  // One transition per frame kind: the answer is whether the frame is accepted in the current state.
  const transitions: { [K in TerminalFrame['kind']]: (frame: FrameOf<K>) => boolean } = {
    fault: () => false,
    ready: () => enter('launching', 'ready'),
    opened: () => enter('ready', 'idle'),
    started: frame => ofLeg(frame.leg) && enter('starting', 'running'),
    between(frame) {
      if (!ofLeg(frame.leg)) return false
      between += frame.bytes.length
      return inLeg() && !begun && between <= input.betweenSegmentBytes
    },
    begun(frame) {
      if (!ofLeg(frame.leg) || !inLeg() || begun) return false
      begun = true
      return true
    },
    data: frame => ofLeg(frame.leg) && inLeg() && begun,
    finished(frame) {
      if (!ofLeg(frame.leg) || !begun || !enter('running', 'idle')) return false
      leg = undefined
      return true
    },
  }
  const apply = <K extends TerminalFrame['kind']>(frame: FrameOf<K>): boolean =>
    transitions[frame.kind](frame)
  return Object.freeze({
    expectLeg(id: string) {
      if (state !== 'idle') {
        state = 'fault'
        return
      }
      state = 'starting'
      leg = id
      begun = false
      between = 0
    },
    push(bytes: Uint8Array): FrameStep {
      if (state === 'fault') return fault()
      const frames: TerminalFrame[] = []
      // Scan each bounded part before appending, so a hostile single chunk cannot grow the accumulator.
      for (let start = 0; start < bytes.length;) {
        const tail = bytes.subarray(start)
        const end = tail.indexOf(10)
        const length = end < 0 ? tail.length : end
        if (pending.length + length > input.maxControlBytes) return fault(frames)
        pending = Buffer.concat([pending, tail.subarray(0, length)])
        start += length + (end < 0 ? 0 : 1)
        if (end < 0) break
        let value: unknown
        try {
          value = JSON.parse(pending.toString('utf8'))
        } catch {
          return fault(frames)
        }
        pending = Buffer.alloc(0)
        const frame = decode(value, input.generation, input.maxChunkBytes)
        if (frame === undefined || !apply(frame)) return fault(frames)
        frames.push(frame)
      }
      return { kind: 'frames', frames }
    },
  })
}
