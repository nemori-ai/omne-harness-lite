// The gate of one persistent terminal on macOS, without its process wiring. The provider starts the
// gate detached, so it leads a new POSIX session; node-pty starts the shell as the leader of a
// second one. It does the I/O of the Linux terminal gate (`../terminal-gate.ts`) with the judgments
// and the segment state machine of `../terminal-gate-core.ts`, and differs in four places: before
// `ready` it checks that it leads its own session; the FIFOs live in the directory the provider
// names; node-pty's native fork gets the path of its spawn-helper; and when the control channel ends
// after GO, the provider went away and the gate stops both sessions before it exits. The script
// `terminal-gate.ts` gives it the real channels and node-pty; a test gives it streams of its own.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, constants, mkdirSync, openSync, readSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import {
  beginLeg,
  forkArguments,
  noSegments,
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

/** The bound of one reading, and of the gate's own stop when the provider went away. */
const readerBoundMs = 10_000

/** What the gate reads and writes, how it starts the PTY, and how it ends its process. */
export type TerminalGateIo = Readonly<{
  /** Manager to gate, one JSON object per line. */
  control: Readable
  /** Gate to manager, one JSON frame per line. */
  frames: Writable
  /** The domain name. */
  unit: string
  /** The path of the session reader. */
  reader: string
  /** The path of node-pty's spawn-helper. */
  helper: string
  /** The directory the gate creates for its two FIFOs. */
  directory: string
  /** The gate's own pid, which is its session's id when it leads its session. */
  pid: number
  /** node-pty's native fork, bound to its module; undefined when it has none. Asked for at GO. */
  ptyFork(): ((...args: unknown[]) => unknown) | undefined
  /** Registers what the gate closes when its process exits. */
  atExit(close: () => void): void
  exit(code: number): void
}>

type CommandKind = ControlCommand['kind']
type CommandHandlers = {
  readonly [K in CommandKind]: (command: Extract<ControlCommand, { kind: K }>) => void
}

export function runTerminalGate(io: TerminalGateIo): void {
  const { control, frames, unit, reader, helper, directory, pid } = io
  const paths = {
    commands: join(directory, 'commands'),
    observations: join(directory, 'observations'),
  }
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
    if (!frames.write(`${JSON.stringify({ ...frame, generation: initial?.generation })}\n`))
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
    const identity = await readIdentity({ reader, pid, boundMs: readerBoundMs })
    return identity?.kind === 'alive' && identity.sid === pid
  }

  function start(config: Initial): void {
    const fork = io.ptyFork()
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
    if (pty === undefined) {
      io.exit(0)
      return
    }
    // After GO the provider went away: nothing on macOS outlives it. Both sessions are stopped.
    void stopSessions({
      reader,
      sessions: [pid, pty.pid],
      except: pid,
      boundMs: readerBoundMs,
    }).finally(() => io.exit(0))
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
  frames.on('drain', onDrain)
  frames.on('error', onFramesError)
  io.atExit(onExit)
}
