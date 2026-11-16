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
  detached = true
  resume()
}

process.stdout.on('error', onFramesError)
process.stdout.on('drain', onDrain)

const control = new Socket({ fd: 3, readable: true, writable: false })
control.on('error', () => undefined)

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

function onControlEnd(): void {
  if (!went) process.exit(0)
}

control.setEncoding('utf8')
control.on('data', receive)
control.on('end', onControlEnd)
