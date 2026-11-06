// The judgments of the command gate process, without I/O. The gate script `command-gate.ts` keeps
// every piece of state, reads its channels and its own cgroup, and acts on what these functions
// return: the parsed request, the action for one control line, the frames for a chunk of output,
// and whether the quiet period after the command's exit ends now, starts again or waits.
// Nothing here throws: input that does not parse is a returned value.

export type GateRequest = Readonly<{
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  /** Standard input bytes in base64, or null for none. */
  stdin: string | null
  maxChunkBytes: number
}>

export type OutputStream = 'stdout' | 'stderr'

/** The frames the gate writes to the manager, one JSON object per line, keys in this order. */
export type CommandFrame =
  | Readonly<{ t: 'ready' }>
  | Readonly<{ t: 'started' }>
  | Readonly<{ t: 'spawnFailed'; code: string }>
  | Readonly<{ t: 'data'; s: OutputStream; b: string }>
  | Readonly<{ t: 'exit'; code: number | null; signal: string | null; members: number | null }>

export type ExitStatus = Readonly<{ code: number | null; signal: string | null }>

/** What the gate knows when a control line arrives. */
export type ControlState = Readonly<{
  /** The scope unit the gate was started in; empty when the manager gave none. */
  unit: string
  /** The accepted request, after the first control line. */
  request: GateRequest | undefined
  /** Whether the command was started. */
  went: boolean
}>

/** What the gate does for one control line. */
export type ControlAction =
  /** Not JSON, not an object after the request, or a command that does not apply now. */
  | Readonly<{ kind: 'ignore' }>
  /** The first line is no valid request, or the gate is not in its own unit: the gate exits with 2. */
  | Readonly<{ kind: 'reject' }>
  /** The first line is a valid request and the gate runs in its own unit. */
  | Readonly<{ kind: 'ready'; request: GateRequest }>
  /** The first GO: start the command. */
  | Readonly<{ kind: 'go'; request: GateRequest }>
  | Readonly<{ kind: 'term' }>
  | Readonly<{ kind: 'retain' }>

/** What the gate holds when it decides whether the output after the exit is complete. */
export type ExitWait = Readonly<{
  exited: boolean
  paused: boolean
  finished: boolean
  openStreams: number
}>

/** `finish`: send the exit frame now; `arm`: start the quiet period again; `none`: wait. */
export type ExitStep = 'finish' | 'arm' | 'none'

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string')
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

function isOptionalText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isChunkBound(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

export function parseRequest(value: unknown): GateRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const executable: unknown = Reflect.get(value, 'executable')
  const args: unknown = Reflect.get(value, 'args')
  const cwd: unknown = Reflect.get(value, 'cwd')
  const env: unknown = Reflect.get(value, 'env')
  const stdin: unknown = Reflect.get(value, 'stdin')
  const maxChunkBytes: unknown = Reflect.get(value, 'maxChunkBytes')
  if (typeof executable !== 'string' || typeof cwd !== 'string') return undefined
  if (!isStringArray(args) || !isStringRecord(env)) return undefined
  if (!isOptionalText(stdin) || !isChunkBound(maxChunkBytes)) return undefined
  return { executable, args, cwd, env, stdin, maxChunkBytes }
}

/** Whether the `0::` line of `/proc/self/cgroup` text ends in the unit's name. */
export function cgroupNamesUnit(cgroupText: string, unit: string): boolean {
  return cgroupText
    .split('\n')
    .some(line => line.startsWith('0::') && line.split('/').at(-1) === unit)
}

/** The complete lines of the control channel so far, and the start of the next one. */
export function splitLines(
  pending: string,
  text: string,
): Readonly<{ lines: string[]; pending: string }> {
  const lines = `${pending}${text}`.split('\n')
  const rest = lines.pop() ?? ''
  return { lines, pending: rest }
}

/** One chunk of a command's output as data frames of at most `maxChunkBytes` bytes each. */
export function dataFrames(
  chunk: Uint8Array,
  stream: OutputStream,
  maxChunkBytes: number,
): CommandFrame[] {
  const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  const frames: CommandFrame[] = []
  for (let at = 0; at < bytes.length; at += maxChunkBytes)
    frames.push({
      t: 'data',
      s: stream,
      b: bytes.subarray(at, at + maxChunkBytes).toString('base64'),
    })
  return frames
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

/** The first control line: a valid request, and the gate in its own unit. */
function admit(message: unknown, unit: string, inOwnScope: () => boolean): ControlAction {
  const request = parseRequest(message)
  if (request === undefined || unit === '' || !inOwnScope()) return { kind: 'reject' }
  return { kind: 'ready', request }
}

/** A control line after the request: `go` once, `term`, `retain`; anything else is ignored. */
function command(message: unknown, request: GateRequest, went: boolean): ControlAction {
  if (typeof message !== 'object' || message === null) return { kind: 'ignore' }
  const name: unknown = Reflect.get(message, 'c')
  if (name === 'go' && !went) return { kind: 'go', request }
  if (name === 'term') return { kind: 'term' }
  if (name === 'retain') return { kind: 'retain' }
  return { kind: 'ignore' }
}

/**
 * Judges one control line. `inOwnScope` reads the gate's cgroup; it is called only for a valid
 * first request with a unit name.
 */
export function controlStep(
  state: ControlState,
  line: string,
  inOwnScope: () => boolean,
): ControlAction {
  // JSON.parse never returns undefined, so undefined here means the line is not JSON.
  const message = parseJson(line)
  if (message === undefined) return { kind: 'ignore' }
  if (state.request === undefined) return admit(message, state.unit, inOwnScope)
  return command(message, state.request, state.went)
}

/** After the main process exits, output that stays quiet for a while is complete. */
export function afterExit(wait: ExitWait): ExitStep {
  if (!wait.exited || wait.paused || wait.finished) return 'none'
  return wait.openStreams === 0 ? 'finish' : 'arm'
}

/** The exit frame, with the count of the unit's other members, or null when it cannot be read. */
export function exitFrame(status: ExitStatus, members: number | null): CommandFrame {
  return { t: 'exit', code: status.code, signal: status.signal, members }
}

/** The frame for a command that could not start, with the error code when it has one. */
export function spawnFailedFrame(code: unknown): CommandFrame {
  return { t: 'spawnFailed', code: typeof code === 'string' ? code : 'unknown' }
}

/** The bytes the command reads on standard input; none when the request gives none. */
export function standardInput(request: GateRequest): Buffer | undefined {
  return request.stdin === null ? undefined : Buffer.from(request.stdin, 'base64')
}
