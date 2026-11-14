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

const quietAfterExitMs = 100
const readerBoundMs = 10_000

export type CommandGateIo = Readonly<{
  control: Readable
  frames: Writable
  unit: string
  reader: string
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
