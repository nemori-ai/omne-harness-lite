// The gate of one host command on macOS, without its process wiring. The provider starts the gate
// detached, so it leads a new POSIX session: that session is the command's domain. It speaks the
// protocol of the Linux gate (`../command-gate.ts`) with the judgments of `../command-gate-core.ts`,
// and differs in three places. It checks once, before it reads the control channel, that it leads
// its own session. At exit it counts the session's members with the session reader. When the
// control channel ends after GO, the provider went away and nothing on macOS outlives it: the gate
// stops every other member of its session and exits. The script `command-gate.ts` gives it the
// real channels; a test gives it streams of its own.
import { spawn, type ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import {
  afterExit,
  controlStep,
  dataFrames,
  exitFrame,
  spawnFailedFrame,
  splitLines,
  standardInput,
  type CommandFrame,
  type ExitStatus,
  type GateRequest,
  type OutputStream,
} from '../command-gate-core.ts'
import { readIdentity, readMembers, stopSessions } from './session.ts'

/** After the main process exits, output that stays quiet this long is complete. */
const quietAfterExitMs = 100
/** The bound of one reading, and of the gate's own stop when the provider went away. */
const readerBoundMs = 10_000

/** What the gate reads and writes, and how it ends its process. */
export type CommandGateIo = Readonly<{
  /** Manager to gate, one JSON object per line. */
  control: Readable
  /** Gate to manager, one JSON frame per line. */
  frames: Writable
  /** The domain name. */
  unit: string
  /** The path of the session reader. */
  reader: string
  /** The gate's own pid, which is its session's id when it leads its session. */
  pid: number
  exit(code: number): void
}>

export function runCommandGate(io: CommandGateIo): void {
  const { control, frames, unit, reader, pid } = io
  let detached = false
  let paused = false
  let leads = false
  let request: GateRequest | undefined
  let child: ChildProcess | undefined
  let went = false
  let spawned = false
  let exitStatus: ExitStatus | undefined
  let openStreams = 2
  let quiet: ReturnType<typeof setTimeout> | undefined
  let finished = false

  function send(frame: CommandFrame): boolean {
    if (detached) return true
    return frames.write(`${JSON.stringify(frame)}\n`)
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
    if (quiet !== undefined) clearTimeout(quiet)
    for (const stream of streams()) stream.pause()
  }

  function resume(): void {
    if (!paused) return
    paused = false
    for (const stream of streams()) stream.resume()
    armQuiet()
  }

  frames.on('error', () => {
    detached = true
    resume()
  })
  frames.on('drain', resume)

  async function finish(): Promise<void> {
    if (finished || exitStatus === undefined) return
    finished = true
    if (quiet !== undefined) clearTimeout(quiet)
    const members = await readMembers({
      reader,
      sessions: [pid],
      except: pid,
      boundMs: readerBoundMs,
    })
    send(exitFrame(exitStatus, members === undefined ? null : members.length))
    // From here on the pipes are drained and discarded; the gate stays until its session is stopped.
    paused = false
    for (const stream of streams()) stream.resume()
    setInterval(() => undefined, 2_147_483_647)
  }

  function armQuiet(): void {
    const step = afterExit({ exited: exitStatus !== undefined, paused, finished, openStreams })
    if (step === 'finish') return void finish()
    if (step === 'none') return
    if (quiet !== undefined) clearTimeout(quiet)
    quiet = setTimeout(() => void finish(), quietAfterExitMs)
  }

  function forward(stream: Readable, name: OutputStream, maxChunkBytes: number): void {
    stream.on('data', (chunk: Buffer) => {
      if (finished) return
      for (const frame of dataFrames(chunk, name, maxChunkBytes)) if (!send(frame)) pause()
      armQuiet()
    })
    stream.on('end', () => {
      openStreams--
      armQuiet()
    })
    stream.on('error', () => undefined)
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
    started.once('spawn', () => {
      spawned = true
      send({ t: 'started' })
      started.stdin?.end(standardInput(go))
    })
    started.once('error', error => {
      if (spawned) return
      send(spawnFailedFrame(Reflect.get(error, 'code')))
      control.destroy()
    })
    started.once('exit', (code, signal) => {
      exitStatus = { code, signal }
      armQuiet()
    })
    if (started.stdout) forward(started.stdout, 'stdout', go.maxChunkBytes)
    if (started.stderr) forward(started.stderr, 'stderr', go.maxChunkBytes)
  }

  function onControl(line: string): void {
    const action = controlStep({ unit, request, went }, line, () => leads && reader !== '')
    switch (action.kind) {
      case 'reject':
        process.stderr.write('omne-host gate: bad request or not leading its own session\n')
        io.exit(2)
        break
      case 'ready':
        request = action.request
        send({ t: 'ready' })
        break
      case 'go':
        went = true
        run(action.request)
        break
      case 'term':
        child?.kill('SIGTERM')
        break
      // Nothing on macOS is handed over, so `retain` never arrives; it would change nothing here.
      case 'retain':
      case 'ignore':
        break
      default: {
        const exhaustive: never = action
        return exhaustive
      }
    }
  }

  control.on('error', () => undefined)
  control.pause()
  let pending = ''
  control.setEncoding('utf8')
  control.on('data', (text: string) => {
    const split = splitLines(pending, text)
    pending = split.pending
    for (const line of split.lines) onControl(line)
  })
  // Without GO the command never started: the gate exits. After GO the provider went away: the gate
  // stops every other member of its session, then exits; the manager's own stop needs no gate.
  control.on('end', () => {
    if (!went) {
      io.exit(0)
      return
    }
    void stopSessions({
      reader,
      sessions: [pid],
      except: pid,
      boundMs: readerBoundMs,
    }).finally(() => io.exit(0))
  })

  // The session is checked once, before the first control line is read.
  void readIdentity({ reader, pid, boundMs: readerBoundMs }).then(identity => {
    leads = identity?.kind === 'alive' && identity.sid === pid
    control.resume()
  })
}
