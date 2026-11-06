// The gate process of one persistent terminal, in the terminal's scope unit. It is a script: nothing
// imports it. This file keeps the current state and does the I/O: the control channel on file
// descriptor 3, the frames on standard output, the two FIFOs to the Bash driver and the PTY. The
// judgments and the segment state machine are in `terminal-gate-core.ts`.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, constants, mkdirSync, openSync, readSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Socket } from 'node:net'
import { join } from 'node:path'
import { ownUnitPlacement } from './scope-cgroup.ts'
import {
  beginLeg,
  forkArguments,
  noSegments,
  ptyFork,
  ptyHandle,
  readControlLine,
  readObservations,
  readOutput,
  settle,
  splitControl,
  type ControlCommand,
  type Initial,
  type Leg,
  type Pty,
  type Segments,
  type Step,
  type TerminalFrame,
} from './terminal-gate-core.ts'

const unit = process.argv[2] ?? ''
const directory = `/tmp/${unit}.terminal`
const paths = {
  commands: join(directory, 'commands'),
  observations: join(directory, 'observations'),
}
const require = createRequire(import.meta.url)
const control = new Socket({ fd: 3, readable: true, writable: false })
let initial: Initial | undefined
let pty: Pty | undefined
let commands: number | undefined
let observations: number | undefined
let pending: Buffer = Buffer.alloc(0)
let queued: Buffer = Buffer.alloc(0)
let stdin: Buffer = Buffer.alloc(0)
let segments: Segments = noSegments
let blocked = false
let detached = false
let ended = false
let timer: ReturnType<typeof setInterval> | undefined

function send(frame: TerminalFrame): void {
  if (detached) return
  if (!process.stdout.write(`${JSON.stringify({ ...frame, generation: initial?.generation })}\n`))
    blocked = true
}

function fail(): void {
  if (ended) return
  ended = true
  send({ t: 'fault' })
  clearInterval(timer)
  control.destroy()
  // The manager or a cold recovery stops the original scope. This gate cannot certify its own stop.
}

/** Takes one step of the state machine: its frames first, then its failure. A failed gate sends nothing more. */
function apply(step: Step): void {
  if (ended) return
  segments = step.state
  step.frames.forEach(frame => send(frame))
  stdin = step.stdin ?? stdin
  if (step.fault) fail()
}

function errno(error: unknown): unknown {
  return error instanceof Error ? Reflect.get(error, 'code') : undefined
}

/** A descriptor that would block is no failure; any other error fails the gate. */
function failUnlessAgain(error: unknown): void {
  if (errno(error) !== 'EAGAIN') fail()
}

/** One non-blocking read; empty at the end of what is there now, or after a failure. */
function readOnce(fd: number, buffer: Buffer): Buffer {
  try {
    return buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, null))
  } catch (error) {
    failUnlessAgain(error)
    return buffer.subarray(0, 0)
  }
}

const flowing = () => !blocked && !ended

function readAvailable(fd: number, bound: number, consume: (bytes: Buffer) => void): void {
  const buffer = Buffer.allocUnsafe(bound)
  while (flowing()) {
    const bytes = readOnce(fd, buffer)
    if (bytes.length === 0) return
    consume(bytes)
  }
}

function writeSome(fd: number, bytes: Buffer): Buffer {
  try {
    return bytes.subarray(writeSync(fd, bytes))
  } catch (error) {
    failUnlessAgain(error)
    return bytes
  }
}

function writeAvailable(fd: number, bytes: Buffer): Buffer {
  return bytes.length === 0 ? bytes : writeSome(fd, bytes)
}

function flush(): void {
  if (commands !== undefined) queued = writeAvailable(commands, queued)
  if (pty !== undefined) stdin = writeAvailable(pty.fd, stdin)
}

function pollOnce(config: Initial): void {
  flush()
  if (observations !== undefined)
    readAvailable(observations, config.maxControlBytes, bytes =>
      apply(readObservations(segments, bytes, config)),
    )
  if (pty === undefined) return
  readAvailable(pty.fd, config.maxChunkBytes, bytes => apply(readOutput(segments, bytes, config)))
  apply(settle(segments, config))
}

function pollGuarded(config: Initial): void {
  try {
    pollOnce(config)
  } catch {
    fail()
  }
}

function poll(): void {
  if (initial !== undefined && flowing()) pollGuarded(initial)
}

function inOwnScope(): boolean {
  return ownUnitPlacement(unit).kind === 'inUnit'
}

function start(config: Initial): void {
  const fork = ptyFork(require('node-pty'))
  if (fork === undefined) return fail()
  const forked = ptyHandle(fork(...forkArguments(config, paths, () => fail())))
  if (forked === undefined) return fail()
  pty = forked
  timer = setInterval(poll, 5)
}

function open(config: Initial): void {
  initial = config
  if (!inOwnScope()) return fail()
  mkdirSync(directory, { mode: 0o700 })
  execFileSync('/usr/bin/mkfifo', ['--mode=600', paths.commands, paths.observations], {
    stdio: 'ignore',
  })
  commands = openSync(paths.commands, constants.O_RDWR | constants.O_NONBLOCK)
  observations = openSync(paths.observations, constants.O_RDWR | constants.O_NONBLOCK)
  send({ t: 'ready' })
}

function execute(leg: Leg): void {
  const begun = beginLeg(segments, leg, randomBytes(16).toString('hex'))
  if (begun.kind === 'fault') return fail()
  segments = begun.state
  queued = begun.source
  poll()
}

type CommandKind = ControlCommand['kind']
type CommandHandlers = {
  readonly [K in CommandKind]: (command: Extract<ControlCommand, { kind: K }>) => void
}

const commandHandlers: CommandHandlers = {
  fault: () => fail(),
  initial: command => open(command.initial),
  go: command => start(command.initial),
  term: command => {
    process.kill(command.pid, 'SIGTERM')
  },
  execute: command => execute(command.leg),
}

function act<K extends CommandKind>(command: Extract<ControlCommand, { kind: K }>): void {
  const handler: (command: Extract<ControlCommand, { kind: K }>) => void =
    commandHandlers[command.kind]
  handler(command)
}

function handleLines(lines: readonly string[]): void {
  for (const line of lines) {
    act(readControlLine(line, { initial, pty }))
    if (ended) return
  }
}

function receive(bytes: Buffer): void {
  const split = splitControl(pending, bytes, initial?.maxControlBytes)
  if (split.kind === 'overflow') return fail()
  pending = split.pending
  handleLines(split.lines)
}

function onControlData(bytes: Buffer): void {
  try {
    receive(bytes)
  } catch {
    fail()
  }
}

function onControlEnd(): void {
  if (pty === undefined) process.exit(0)
}

function onDrain(): void {
  blocked = false
  poll()
}

function onFramesError(): void {
  detached = true
  blocked = false
}

function closeQuietly(fd: number | undefined): void {
  if (fd === undefined) return
  try {
    closeSync(fd)
  } catch {
    /* The descriptor may already be closed after a failed launch. */
  }
}

function onExit(): void {
  for (const fd of [commands, observations, pty?.fd]) closeQuietly(fd)
}

control.on('data', onControlData)
control.on('error', fail)
control.on('end', onControlEnd)
process.stdout.on('drain', onDrain)
process.stdout.on('error', onFramesError)
process.on('exit', onExit)
