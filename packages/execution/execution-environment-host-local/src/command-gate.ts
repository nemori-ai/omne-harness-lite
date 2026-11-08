// The gate process of one host command. `systemd-run --scope` starts it inside the command's own
// scope unit; the provider's manager talks to it over two private channels:
// - control, file descriptor 3, manager to gate, one JSON object per line: first the request, then
//   `{"c":"go"}` at most once, `{"c":"term"}` for a graceful stop, and `{"c":"retain"}` after the
//   exit frame when the manager handed the unit over to a retention scope;
// - frames, standard output, gate to manager, one JSON object per line: `ready`, then `started` or
//   `spawnFailed`, then `data` frames, then one `exit` with the count of the unit's other members,
//   then `data` and `x` (bytes dropped) frames of what the unit still writes.
// The gate checks that it runs in its own unit before it reports ready, starts the command only on
// GO, gives it only the requested environment, and pauses the command's pipes while its frame pipe
// is full, so the bytes waiting between command and manager stay bounded. After the exit frame it
// stays in the unit and keeps reading the command's two pipes without ever pausing them, so
// processes the command left behind never block on them or see SIGPIPE: it relays the bytes while
// the frame pipe takes them, counts them while it is full and reports the count once it drains, and
// discards them once the manager is gone. The manager decides whether the unit is stopped or kept,
// and a manager that went away leaves it to cold recovery. It is a script:
// nothing imports it. It uses Node built-ins, the cgroup placement module and its pure judgments in
// `command-gate-core.ts` only: this file keeps the state and does the I/O.
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Socket } from 'node:net'
import type { Readable } from 'node:stream'
import {
  afterExit,
  afterExitRelay,
  chunkRoute,
  controlStep,
  cgroupNamesUnit,
  dataFrames,
  drainAfterExit,
  relayAfterExit,
  exitFrame,
  spawnFailedFrame,
  splitLines,
  standardInput,
  type ChunkRoute,
  type CommandFrame,
  type ControlAction,
  type ExitStatus,
  type GateRequest,
  type OutputStream,
} from './command-gate-core.ts'
import { ownUnitPlacement, scopeMembers } from './scope-cgroup.ts'

/** After the main process exits, output that stays quiet this long is complete. */
const quietAfterExitMs = 100

const unit = process.argv[2] ?? ''
let detached = false
let paused = false
let request: GateRequest | undefined
let child: ChildProcess | undefined
let went = false
let spawned = false
let exitStatus: ExitStatus | undefined
let openStreams = 2
let quiet: ReturnType<typeof setTimeout> | undefined
let finished = false
const relay = afterExitRelay()

function send(frame: CommandFrame): boolean {
  if (detached) return true
  return process.stdout.write(`${JSON.stringify(frame)}\n`)
}

function streams(): Readable[] {
  const out: Readable[] = []
  if (child?.stdout) out.push(child.stdout)
  if (child?.stderr) out.push(child.stderr)
  return out
}

function pause(): void {
  if (paused) return
  paused = true
  clearTimeout(quiet)
  for (const stream of streams()) stream.pause()
}

function resume(): void {
  if (!paused) return
  paused = false
  for (const stream of streams()) stream.resume()
  armQuiet()
}

function onDrain(): void {
  if (finished) drainAfterExit(relay, send)
  else resume()
}

function onFramesError(): void {
  // A manager that went away leaves the command running; the gate keeps draining its pipes.
  detached = true
  resume()
}

process.stdout.on('error', onFramesError)
process.stdout.on('drain', onDrain)

const control = new Socket({ fd: 3, readable: true, writable: false })
control.on('error', () => undefined)

/** The unit's members other than this gate, from the kernel's list; null when it cannot be read. */
function otherMembers(): number | null {
  const placement = ownUnitPlacement(unit)
  const pids = placement.kind === 'inUnit' ? scopeMembers(placement.directory) : undefined
  return pids === undefined ? null : pids.filter(pid => pid !== process.pid).length
}

function finish(): void {
  const status = exitStatus
  if (finished || status === undefined) return
  finished = true
  clearTimeout(quiet)
  send(exitFrame(status, otherMembers()))
  // From here on the pipes are never paused: output is relayed while the manager reads it and
  // counted while it does not, and discarded once the manager is gone. The gate stays until its
  // unit is stopped.
  paused = false
  streams().forEach(stream => stream.resume())
  setInterval(() => undefined, 2_147_483_647)
}

function armQuiet(): void {
  const step = afterExit({ exited: exitStatus !== undefined, paused, finished, openStreams })
  if (step === 'finish') return finish()
  if (step === 'arm') {
    clearTimeout(quiet)
    quiet = setTimeout(finish, quietAfterExitMs)
  }
}

function sendData(frame: CommandFrame): void {
  if (!send(frame)) pause()
}

type ChunkHandler = (chunk: Buffer, name: OutputStream, maxChunkBytes: number) => void

const chunkHandlers: Readonly<Record<ChunkRoute, ChunkHandler>> = {
  frames: (chunk, name, maxChunkBytes) => {
    for (const frame of dataFrames(chunk, name, maxChunkBytes)) sendData(frame)
    armQuiet()
  },
  relay: (chunk, name, maxChunkBytes) => relayAfterExit(relay, chunk, name, maxChunkBytes, send),
  discard: () => undefined,
}

function forwardChunk(chunk: Buffer, name: OutputStream, maxChunkBytes: number): void {
  chunkHandlers[chunkRoute({ finished, detached })](chunk, name, maxChunkBytes)
}

function onStreamEnd(): void {
  openStreams--
  armQuiet()
}

function forward(stream: Readable | null, name: OutputStream, maxChunkBytes: number): void {
  if (stream === null) return
  stream.on('data', (chunk: Buffer) => forwardChunk(chunk, name, maxChunkBytes))
  stream.on('end', onStreamEnd)
  stream.on('error', () => undefined)
}

function onSpawned(started: ChildProcess, go: GateRequest): void {
  spawned = true
  send({ t: 'started' })
  started.stdin?.end(standardInput(go))
}

function onSpawnError(error: Error): void {
  if (spawned) return
  send(spawnFailedFrame(Reflect.get(error, 'code')))
  control.destroy()
}

function run(go: GateRequest): void {
  // A fourth pipe takes descriptor 3 in the command, so the control channel does not leak into it.
  const started = spawn(go.executable, [...go.args], {
    cwd: go.cwd,
    env: { ...go.env },
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  })
  child = started
  started.stdio[3]?.destroy()
  started.stdin?.on('error', () => undefined)
  started.once('spawn', () => onSpawned(started, go))
  started.once('error', onSpawnError)
  started.once('exit', (code, signal) => {
    exitStatus = { code, signal }
    armQuiet()
  })
  forward(started.stdout, 'stdout', go.maxChunkBytes)
  forward(started.stderr, 'stderr', go.maxChunkBytes)
}

function inOwnScope(): boolean {
  try {
    return cgroupNamesUnit(readFileSync('/proc/self/cgroup', 'utf8'), unit)
  } catch {
    return false
  }
}

type ControlKind = ControlAction['kind']
type ControlHandlers = {
  readonly [K in ControlKind]: (action: Extract<ControlAction, { kind: K }>) => void
}

const controlHandlers: ControlHandlers = {
  ignore: () => undefined,
  reject: () => {
    process.stderr.write('omne-host gate: bad request or not in its own scope\n')
    process.exit(2)
  },
  ready: action => {
    request = action.request
    send({ t: 'ready' })
  },
  go: action => {
    went = true
    run(action.request)
  },
  term: () => child?.kill('SIGTERM'),
  // `retain`: the unit was handed over. The manager closes the control channel and keeps reading
  // frames for the retained process's tail; a manager that closes the frame channel too makes the
  // gate discard. A manager that stops the unit instead kills the gate with it.
  retain: () => undefined,
}

function act<K extends ControlKind>(action: Extract<ControlAction, { kind: K }>): void {
  const handler: (action: Extract<ControlAction, { kind: K }>) => void =
    controlHandlers[action.kind]
  handler(action)
}

function onControl(line: string): void {
  act(controlStep({ unit, request, went }, line, inOwnScope))
}

let pending = ''

function receive(text: string): void {
  const split = splitLines(pending, text)
  pending = split.pending
  for (const line of split.lines) onControl(line)
}

// Without GO the command never starts: a closed control channel ends the gate. After GO the gate
// stays whatever the channel does: a manager that went away leaves the unit to cold recovery.
function onControlEnd(): void {
  if (!went) process.exit(0)
}

control.setEncoding('utf8')
control.on('data', receive)
control.on('end', onControlEnd)
