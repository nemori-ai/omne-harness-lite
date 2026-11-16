export type GateRequest = Readonly<{
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  stdin: string | null
  maxChunkBytes: number
}>

export type OutputStream = 'stdout' | 'stderr'

export type CommandFrame =
  | Readonly<{ t: 'ready' }>
  | Readonly<{ t: 'started' }>
  | Readonly<{ t: 'spawnFailed'; code: string }>
  | Readonly<{ t: 'data'; s: OutputStream; b: string }>
  | Readonly<{ t: 'exit'; code: number | null; signal: string | null; members: number | null }>
  | Readonly<{ t: 'x'; s: OutputStream; n: number }>

export type AfterExitRelay = { dropping: boolean; readonly dropped: Record<OutputStream, number> }

export function afterExitRelay(): AfterExitRelay {
  return { dropping: false, dropped: { stdout: 0, stderr: 0 } }
}

export function relayAfterExit(
  relay: AfterExitRelay,
  chunk: Uint8Array,
  stream: OutputStream,
  maxChunkBytes: number,
  send: (frame: CommandFrame) => boolean,
): void {
  for (let at = 0; at < chunk.length; at += maxChunkBytes) {
    const part = chunk.subarray(at, at + maxChunkBytes)
    const [frame] = dataFrames(part, stream, maxChunkBytes)
    if (relay.dropping) relay.dropped[stream] += part.length
    else if (frame !== undefined && !send(frame)) relay.dropping = true
  }
}

export function drainAfterExit(
  relay: AfterExitRelay,
  send: (frame: CommandFrame) => boolean,
): void {
  relay.dropping = false
  for (const s of ['stdout', 'stderr'] as const) {
    const n = relay.dropped[s]
    if (n === 0) continue
    relay.dropped[s] = 0
    if (!send({ t: 'x', s, n })) relay.dropping = true
  }
}

export type ExitStatus = Readonly<{ code: number | null; signal: string | null }>

export type ControlState = Readonly<{
  unit: string
  request: GateRequest | undefined
  went: boolean
}>

export type ControlAction =
  | Readonly<{ kind: 'ignore' }>
  | Readonly<{ kind: 'reject' }>
  | Readonly<{ kind: 'ready'; request: GateRequest }>
  | Readonly<{ kind: 'go'; request: GateRequest }>
  | Readonly<{ kind: 'term' }>
  | Readonly<{ kind: 'retain' }>

export type ExitWait = Readonly<{
  exited: boolean
  paused: boolean
  finished: boolean
  openStreams: number
}>

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

export function cgroupNamesUnit(cgroupText: string, unit: string): boolean {
  return cgroupText
    .split('\n')
    .some(line => line.startsWith('0::') && line.split('/').at(-1) === unit)
}

export function splitLines(
  pending: string,
  text: string,
): Readonly<{ lines: string[]; pending: string }> {
  const lines = `${pending}${text}`.split('\n')
  const rest = lines.pop() ?? ''
  return { lines, pending: rest }
}

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

function admit(message: unknown, unit: string, inOwnScope: () => boolean): ControlAction {
  const request = parseRequest(message)
  if (request === undefined || unit === '' || !inOwnScope()) return { kind: 'reject' }
  return { kind: 'ready', request }
}

function command(message: unknown, request: GateRequest, went: boolean): ControlAction {
  if (typeof message !== 'object' || message === null) return { kind: 'ignore' }
  const name: unknown = Reflect.get(message, 'c')
  if (name === 'go' && !went) return { kind: 'go', request }
  if (name === 'term') return { kind: 'term' }
  if (name === 'retain') return { kind: 'retain' }
  return { kind: 'ignore' }
}

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

export function afterExit(wait: ExitWait): ExitStep {
  if (!wait.exited || wait.paused || wait.finished) return 'none'
  return wait.openStreams === 0 ? 'finish' : 'arm'
}

export type ChunkRoute = 'frames' | 'relay' | 'discard'

export function chunkRoute(state: Readonly<{ finished: boolean; detached: boolean }>): ChunkRoute {
  if (!state.finished) return 'frames'
  return state.detached ? 'discard' : 'relay'
}

export function exitFrame(status: ExitStatus, members: number | null): CommandFrame {
  return { t: 'exit', code: status.code, signal: status.signal, members }
}

export function spawnFailedFrame(code: unknown): CommandFrame {
  return { t: 'spawnFailed', code: typeof code === 'string' ? code : 'unknown' }
}

export function standardInput(request: GateRequest): Buffer | undefined {
  return request.stdin === null ? undefined : Buffer.from(request.stdin, 'base64')
}
