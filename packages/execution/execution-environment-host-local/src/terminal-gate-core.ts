// The judgments and the segment state machine of the terminal gate process, without I/O. The gate
// script `terminal-gate.ts` keeps the current state, reads the control channel, the observation FIFO
// and the PTY, and for each event calls one of these functions. It gets back the next state, the
// frames to send in order and whether the gate fails; it sends the frames first and fails after them.
// The Bash driver text and the source of a segment are built here, with the paths given by the gate.
// Nothing here throws: input that does not parse, or an impossible order, is a returned value.
import {
  releaseSentinels,
  scanSentinels,
  watchSentinels,
  type SentinelPiece,
  type SentinelScan,
  idleSentinels,
} from './terminal-sentinels.ts'

export type Initial = Readonly<{
  generation: string
  cwd: string
  env: Readonly<Record<string, string>>
  columns: number
  rows: number
  maxChunkBytes: number
  maxControlBytes: number
  betweenSegmentBytes: number
}>

export type Leg = Readonly<{
  id: string
  script: string
  cwd?: string
  env?: Readonly<Record<string, string>>
  stdin: Buffer
}>

export type ActiveLeg = Leg & Readonly<{ nonce: string; begun: boolean; sawEnd: boolean }>

export type Pty = Readonly<{ fd: number; pid: number }>

/** The two FIFOs between the gate and the driver: segment sources in, observations out. */
export type DriverPaths = Readonly<{ commands: string; observations: string }>

/** The frames the gate sends, keys in this order; the gate adds the generation to each. */
export type TerminalFrame =
  | Readonly<{ t: 'ready' }>
  | Readonly<{ t: 'fault' }>
  | Readonly<{ t: 'opened'; cwd: string }>
  | Readonly<{ t: 'started'; leg: string }>
  | Readonly<{ t: 'data' | 'between'; leg: string; b: string }>
  | Readonly<{ t: 'begun'; leg: string; discarded: number }>
  | Readonly<{ t: 'finished'; leg: string; code: number; cwd: string }>

/** The finished observation of the current segment, kept until its end sentinel arrives too. */
export type Completion = Readonly<{ code: number; cwd: string }>

/** Everything the gate knows about the segments: the opened shell, the current one, the buffers. */
export type Segments = Readonly<{
  /** Whether the driver reported the shell open. */
  opened: boolean
  active: ActiveLeg | undefined
  completion: Completion | undefined
  sentinels: SentinelScan
  /** Bytes read outside any segment, kept for the next segment up to the configured bound. */
  between: readonly Buffer[]
  betweenKept: number
  betweenDiscarded: number
  /** Observation bytes that do not make a whole record yet. */
  observed: Buffer
}>

export const noSegments: Segments = {
  opened: false,
  active: undefined,
  completion: undefined,
  sentinels: idleSentinels,
  between: [],
  betweenKept: 0,
  betweenDiscarded: 0,
  observed: Buffer.alloc(0),
}

/**
 * The result of one event. The gate sends `frames` in order, then replaces the standard input it
 * still has to write into the PTY with `stdin` when that is given, then fails when `fault` is set.
 */
export type Step = Readonly<{
  state: Segments
  frames: readonly TerminalFrame[]
  fault: boolean
  stdin: Buffer | undefined
}>

/** One line of the control channel, judged against the gate's state. */
export type ControlCommand =
  | Readonly<{ kind: 'fault' }>
  | Readonly<{ kind: 'initial'; initial: Initial }>
  | Readonly<{ kind: 'go'; initial: Initial }>
  | Readonly<{ kind: 'term'; pid: number }>
  | Readonly<{ kind: 'execute'; leg: Leg }>

/** The complete lines of the control channel, or a channel past its bound. */
export type ControlLines =
  | Readonly<{ kind: 'overflow' }>
  | Readonly<{ kind: 'lines'; lines: readonly string[]; pending: Buffer }>

/** A new segment: the next state and the source to write into the command FIFO. */
export type LegStart =
  | Readonly<{ kind: 'fault' }>
  | Readonly<{ kind: 'begun'; state: Segments; source: Buffer }>

/** The control channel's bound before the first message gives one. */
const defaultControlBytes = 1024 * 1024

const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown): value is Record<string, string> =>
  record(value) && Object.values(value).every(v => typeof v === 'string')

export function parseInitial(value: Record<string, unknown>): Initial | undefined {
  const {
    generation,
    cwd,
    env,
    columns,
    rows,
    maxChunkBytes,
    maxControlBytes,
    betweenSegmentBytes,
  } = value
  if (
    typeof generation !== 'string' ||
    typeof cwd !== 'string' ||
    !strings(env) ||
    !positive(columns) ||
    !positive(rows) ||
    !positive(maxChunkBytes) ||
    !positive(maxControlBytes) ||
    !positive(betweenSegmentBytes)
  )
    return undefined
  return {
    generation,
    cwd,
    env,
    columns,
    rows,
    maxChunkBytes,
    maxControlBytes,
    betweenSegmentBytes,
  }
}

export function parseLeg(value: Record<string, unknown>): Leg | undefined {
  const { id, script, cwd, env, stdin } = value
  if (
    typeof id !== 'string' ||
    typeof script !== 'string' ||
    (cwd !== undefined && typeof cwd !== 'string') ||
    (env !== undefined && !strings(env)) ||
    typeof stdin !== 'string'
  )
    return undefined
  return {
    id,
    script,
    ...(cwd === undefined ? {} : { cwd }),
    ...(env === undefined ? {} : { env }),
    stdin: Buffer.from(stdin, 'base64'),
  }
}

/** The program Bash runs in the PTY: it reports the shell open, then evaluates each source read. */
export function shellDriver(config: Initial, paths: DriverPaths): string {
  return `exec 7<${quote(paths.commands)} 8>${quote(paths.observations)}
__omne_report() {
  local __omne_cwd
  __omne_cwd=$(builtin pwd -P; builtin printf .) || return 1
  __omne_cwd=\${__omne_cwd%?}
  __omne_cwd=\${__omne_cwd%?}
  builtin printf '%s\\0' ${quote(config.generation)} "$1" "$2" "$3" "$__omne_cwd" >&8
}
readonly -f __omne_report
__omne_report '' opened 0 || exit 1
while IFS= builtin read -r -d '' __omne_source <&7; do
  builtin eval "$__omne_source"
done
`
}

/**
 * The driver writes the sentinels with the shell's builtin printf to the controlling terminal,
 * so they share the PTY's one ordered buffer with the script's bytes even after the script
 * redirected the shell's own output. The nonce reaches the shell through the command FIFO only.
 */
function sentinelWrite(mark: 'b' | 'e', nonce: string): string {
  return `builtin printf '\\033]7770;omne-${mark};%s\\a' ${quote(nonce)} >/dev/tty || return 125`
}

/** The source of one segment, as the driver evaluates it. */
export function legSource(leg: ActiveLeg): string {
  const environment = Object.entries(leg.env ?? {})
    .map(([key, value]) => `local -x ${key}=${quote(value)} || return 125`)
    .join('\n')
  const cwd =
    leg.cwd === undefined
      ? ''
      : `local __omne_oldcwd
__omne_oldcwd=$(builtin pwd -P; builtin printf .) || return 125
__omne_oldcwd=\${__omne_oldcwd%?}
__omne_oldcwd=\${__omne_oldcwd%?}
builtin cd -- ${quote(leg.cwd)} || return 125`
  const restore = leg.cwd === undefined ? '' : 'builtin cd -- "$__omne_oldcwd" || return 125'
  return `__omne_script() {
builtin eval ${quote(leg.script)}
}
__omne_leg() {
${sentinelWrite('b', leg.nonce)}
${environment}
${cwd}
__omne_report ${quote(leg.id)} started 0 || return 125
__omne_script
local __omne_code=$?
${restore}
${sentinelWrite('e', leg.nonce)}
__omne_report ${quote(leg.id)} finished "$__omne_code" || return 125
}
__omne_leg
if [ $? -ne 0 ]; then exit 125; fi
`
}

/** Splits the control channel into lines; the bound counts the bytes held and the bytes read. */
export function splitControl(
  pending: Buffer,
  bytes: Buffer,
  maxControlBytes: number | undefined,
): ControlLines {
  if (pending.length + bytes.length > (maxControlBytes ?? defaultControlBytes))
    return { kind: 'overflow' }
  let rest = Buffer.concat([pending, bytes])
  const lines: string[] = []
  for (let at = rest.indexOf(10); at !== -1; at = rest.indexOf(10)) {
    lines.push(rest.subarray(0, at).toString('utf8'))
    rest = rest.subarray(at + 1)
  }
  return { kind: 'lines', lines, pending: rest }
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

function firstMessage(value: Record<string, unknown>): ControlCommand {
  const initial = parseInitial(value)
  return initial === undefined ? { kind: 'fault' } : { kind: 'initial', initial }
}

function laterMessage(
  value: Record<string, unknown>,
  initial: Initial,
  pty: Pty | undefined,
): ControlCommand {
  if (value['c'] === 'go' && pty === undefined) return { kind: 'go', initial }
  if (value['c'] === 'term' && pty !== undefined) return { kind: 'term', pid: pty.pid }
  if (value['c'] !== 'execute') return { kind: 'fault' }
  const leg = parseLeg(value)
  return leg === undefined ? { kind: 'fault' } : { kind: 'execute', leg }
}

/**
 * Judges one control line. The first message is the initial configuration; after it, `go` starts
 * the shell once, `term` stops a running shell, and anything else must be a valid `execute`.
 */
export function readControlLine(
  line: string,
  gate: Readonly<{ initial: Initial | undefined; pty: Pty | undefined }>,
): ControlCommand {
  const value = parseJson(line)
  if (!record(value)) return { kind: 'fault' }
  if (gate.initial === undefined) return firstMessage(value)
  return laterMessage(value, gate.initial, gate.pty)
}

/** A step that changes nothing and sends nothing. */
function still(state: Segments): Step {
  return { state, frames: [], fault: false, stdin: undefined }
}

function faulted(step: Step): Step {
  return { ...step, fault: true }
}

function advance(step: Step, state: Segments, frames: readonly TerminalFrame[] = []): Step {
  return { ...step, state, frames: [...step.frames, ...frames] }
}

/** Bytes as frames of at most `bound` bytes each, in base64. */
function chunks(
  t: 'data' | 'between',
  leg: string,
  bytes: Uint8Array,
  bound: number,
): TerminalFrame[] {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frames: TerminalFrame[] = []
  for (let at = 0; at < buffer.length; at += bound)
    frames.push({ t, leg, b: buffer.subarray(at, at + bound).toString('base64') })
  return frames
}

function keepBetween(state: Segments, bytes: Uint8Array, bound: number): Segments {
  const kept = Math.min(bytes.length, bound - state.betweenKept)
  return {
    ...state,
    between: kept > 0 ? [...state.between, Buffer.from(bytes.subarray(0, kept))] : state.between,
    betweenKept: state.betweenKept + kept,
    betweenDiscarded: state.betweenDiscarded + bytes.length - kept,
  }
}

/** The begin sentinel: the bytes kept between segments go first, then `begun` with the count dropped. */
function begin(step: Step, active: ActiveLeg, bound: number): Step {
  const state = step.state
  return advance(
    step,
    {
      ...state,
      active: { ...active, begun: true },
      between: [],
      betweenKept: 0,
      betweenDiscarded: 0,
    },
    [
      ...chunks('between', active.id, Buffer.concat(state.between), bound),
      { t: 'begun', leg: active.id, discarded: state.betweenDiscarded },
    ],
  )
}

/** Applies one attributed piece of PTY output; a fault when the sentinel order is impossible. */
function attribute(step: Step, piece: SentinelPiece, config: Initial): Step {
  const active = step.state.active
  // Every kind returns, so a new kind of piece fails to compile here.
  switch (piece.kind) {
    case 'between':
      return advance(step, keepBetween(step.state, piece.bytes, config.betweenSegmentBytes))
    case 'segment': {
      const current = inSegment(active)
      if (current === undefined) return faulted(step)
      return advance(
        step,
        step.state,
        chunks('data', current.id, piece.bytes, config.maxChunkBytes),
      )
    }
    case 'begin':
      if (active === undefined || active.begun) return faulted(step)
      return begin(step, active, config.maxChunkBytes)
    case 'end': {
      const current = inSegment(active)
      if (current === undefined) return faulted(step)
      return advance(step, { ...step.state, active: { ...current, sawEnd: true } })
    }
  }
}

/** The segment when it passed its begin sentinel and not yet its end sentinel. */
function inSegment(active: ActiveLeg | undefined): ActiveLeg | undefined {
  return active?.begun === true && !active.sawEnd ? active : undefined
}

/** Applies the pieces in order and stops at the first impossible one. */
function attributeAll(step: Step, pieces: readonly SentinelPiece[], config: Initial): Step {
  let current = step
  for (const piece of pieces) {
    if (current.fault) break
    current = attribute(current, piece, config)
  }
  return current
}

/** A chunk read from the PTY, attributed to the current segment or to the bytes between segments. */
export function readOutput(state: Segments, bytes: Uint8Array, config: Initial): Step {
  const scanned = scanSentinels(state.sentinels, bytes)
  return attributeAll(still({ ...state, sentinels: scanned.scan }), scanned.pieces, config)
}

type ObservationRecord = Readonly<{
  generation: string
  id: string
  kind: string
  code: string
  cwd: string
}>

/** The first whole record of five NUL-terminated fields, and the bytes after it. */
function takeRecord(observed: Buffer): { record: ObservationRecord; rest: Buffer } | undefined {
  const fields: string[] = []
  let at = 0
  for (let i = 0; i < 5; i++) {
    const end = observed.indexOf(0, at)
    if (end < 0) return undefined
    fields.push(observed.subarray(at, end).toString('utf8'))
    at = end + 1
  }
  const [generation = '', id = '', kind = '', code = '', cwd = ''] = fields
  return { record: { generation, id, kind, code, cwd }, rest: observed.subarray(at) }
}

function opened(step: Step, record: ObservationRecord): Step {
  const state = step.state
  if (state.opened || state.active !== undefined || record.id !== '') return faulted(step)
  return advance(step, { ...state, opened: true }, [{ t: 'opened', cwd: record.cwd }])
}

/** The segment's script starts: from now on the gate writes its standard input into the PTY. */
function started(step: Step, record: ObservationRecord): Step {
  const active = step.state.active
  if (active === undefined || record.id !== active.id) return faulted(step)
  return { ...advance(step, step.state, [{ t: 'started', leg: record.id }]), stdin: active.stdin }
}

/** A Bash exit status: one to three digits, 255 at most. */
function exitCode(code: string): number | undefined {
  return /^\d{1,3}$/u.test(code) && Number(code) <= 255 ? Number(code) : undefined
}

function finished(step: Step, record: ObservationRecord): Step {
  const code = exitCode(record.code)
  if (record.id !== step.state.active?.id || code === undefined) return faulted(step)
  // Other processes left in the scope do not veto completion; only the control channel decides.
  return advance(step, { ...step.state, completion: { code, cwd: record.cwd } })
}

const observationKinds = new Map<string, (step: Step, record: ObservationRecord) => Step>([
  ['opened', opened],
  ['started', started],
  ['finished', finished],
])

function observe(step: Step, record: ObservationRecord, generation: string): Step {
  if (record.generation !== generation || !record.cwd.startsWith('/')) return faulted(step)
  return observationKinds.get(record.kind)?.(step, record) ?? faulted(step)
}

/**
 * Bytes read from the observation FIFO. Whole records apply in order; the gate fails at the first
 * one that is not possible now, and when the bytes waiting for a whole record pass the bound.
 */
export function readObservations(state: Segments, bytes: Buffer, config: Initial): Step {
  if (state.observed.length + bytes.length > config.maxControlBytes) return faulted(still(state))
  let step = still({ ...state, observed: Buffer.concat([state.observed, bytes]) })
  let next = takeRecord(step.state.observed)
  while (next !== undefined && !step.fault) {
    const consumed = advance(step, { ...step.state, observed: next.rest })
    step = observe(consumed, next.record, config.generation)
    next = takeRecord(step.state.observed)
  }
  return step
}

/**
 * Completes the current segment once both its finished observation and its end sentinel arrived:
 * the two come on unordered channels. The held bytes are attributed, `finished` is sent, and the
 * standard input still unwritten is dropped. Otherwise nothing changes.
 */
export function settle(state: Segments, config: Initial): Step {
  const active = state.active
  const completion = state.completion
  if (completion === undefined || active?.sawEnd !== true) return still(state)
  const released = releaseSentinels(state.sentinels)
  const step = attributeAll(still({ ...state, sentinels: released.scan }), released.pieces, config)
  if (step.fault) return step
  return {
    ...advance(step, { ...step.state, active: undefined, completion: undefined }, [
      { t: 'finished', leg: active.id, code: completion.code, cwd: completion.cwd },
    ]),
    stdin: Buffer.alloc(0),
  }
}

/**
 * Starts a segment on an opened shell with no segment running. The nonce comes from the gate; the
 * source ends in NUL, the record separator of the command FIFO.
 */
export function beginLeg(state: Segments, leg: Leg, nonce: string): LegStart {
  if (!state.opened || state.active !== undefined) return { kind: 'fault' }
  const active: ActiveLeg = { ...leg, nonce, begun: false, sawEnd: false }
  return {
    kind: 'begun',
    state: { ...state, active, sentinels: watchSentinels(state.sentinels, nonce) },
    source: Buffer.from(`${legSource(active)}\0`),
  }
}

/** The fork function of the node-pty native module, bound to it; undefined when it has none. */
export function ptyFork(module: unknown): ((...args: unknown[]) => unknown) | undefined {
  const native: unknown = record(module) ? module['native'] : undefined
  const fork: unknown = record(native) ? native['fork'] : undefined
  if (typeof fork !== 'function') return undefined
  return (...args) => Reflect.apply(fork, native, args)
}

/** The arguments of the native fork: Bash running the driver in the configured terminal. */
export function forkArguments(config: Initial, paths: DriverPaths, onExit: () => void): unknown[] {
  return [
    '/bin/bash',
    ['--noprofile', '--norc', '-c', shellDriver(config, paths)],
    Object.entries(config.env).map(([key, value]) => `${key}=${value}`),
    config.cwd,
    config.columns,
    config.rows,
    -1,
    -1,
    false,
    '',
    onExit,
  ]
}

/** The descriptor and process of a forked PTY; undefined when the result has neither. */
export function ptyHandle(result: unknown): Pty | undefined {
  if (
    !record(result) ||
    !positive(result['pid']) ||
    typeof result['fd'] !== 'number' ||
    !Number.isInteger(result['fd']) ||
    result['fd'] < 0
  )
    return undefined
  return { fd: result['fd'], pid: result['pid'] }
}
