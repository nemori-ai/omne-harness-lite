// The gate process of one persistent terminal on macOS. The provider starts it detached, so it leads
// a new POSIX session; node-pty starts the shell as the leader of a second one. It is a script:
// nothing imports it. It does the I/O of the Linux terminal gate (`../terminal-gate.ts`) with the
// judgments and the segment state machine of `../terminal-gate-core.ts`, and differs in four places:
// before `ready` it checks that it leads its own session; the FIFOs live in the directory the
// provider names; node-pty's native fork gets the path of its spawn-helper; and when the control
// channel ends after GO, the provider went away and the gate stops both sessions before it exits.
// Arguments: the domain name, the session reader, the spawn-helper, the FIFO directory.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, constants, mkdirSync, openSync, readSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Socket } from 'node:net'
import { join } from 'node:path'
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
} from '../terminal-gate-core.ts'
import { readIdentity, stopSessions } from './session.ts'

const unit = process.argv[2] ?? ''
const reader = process.argv[3] ?? ''
const helper = process.argv[4] ?? ''
const directory = process.argv[5] ?? ''
/** The bound of one reading, and of the gate's own stop when the provider went away. */
const readerBoundMs = 10_000
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

async function leadsOwnSession(): Promise<boolean> {
  if (unit === '' || reader === '' || helper === '' || directory === '') return false
  const identity = await readIdentity({ reader, pid: process.pid, boundMs: readerBoundMs })
  return identity?.kind === 'alive' && identity.sid === process.pid
}

function start(config: Initial): void {
  const fork = ptyFork(require('node-pty'))
  if (fork === undefined) return fail()
  // node-pty starts the shell through its spawn-helper on macOS; the Linux gate passes no helper.
  const args = forkArguments(config, paths, () => fail())
  args[9] = helper
  const forked = ptyHandle(fork(...args))
  if (forked === undefined) return fail()
  pty = forked
  timer = setInterval(poll, 5)
}

async function open(config: Initial): Promise<void> {
  initial = config
  if (!(await leadsOwnSession())) return fail()
  mkdirSync(directory, { mode: 0o700 })
  execFileSync('/usr/bin/mkfifo', ['-m', '600', paths.commands, paths.observations], {
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
  initial: command => {
    open(command.initial).catch(() => fail())
  },
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
  // After GO the provider went away: nothing on macOS outlives it. Both sessions are stopped.
  void stopSessions({
    reader,
    sessions: [process.pid, pty.pid],
    except: process.pid,
    boundMs: readerBoundMs,
  }).finally(() => process.exit(0))
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
