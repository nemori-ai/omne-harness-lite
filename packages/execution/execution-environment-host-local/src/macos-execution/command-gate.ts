// The gate process of one host command on macOS. The provider starts it detached, so it leads a
// new POSIX session: that session is the command's domain. It speaks the protocol of the Linux
// gate (`../command-gate.ts`):
// - control, file descriptor 3, manager to gate, one JSON object per line: first the request, then
//   `{"c":"go"}` at most once and `{"c":"term"}` for a graceful stop;
// - frames, standard output, gate to manager, one JSON object per line: `ready`, then `started` or
//   `spawnFailed`, then `data` frames, then one `exit` with the count of the session's other members.
// It differs in three places. Before `ready` it checks that it leads its own session. At exit it
// counts the session's members with the session reader (argv[2]). When the control channel ends
// after GO, the provider went away and nothing on macOS outlives it: the gate stops every other
// member of its session and exits. It is a script: nothing imports it.
import { spawn, type ChildProcess } from 'node:child_process'
import { Socket } from 'node:net'
import type { Readable } from 'node:stream'
import { parseGateRequest, type GateRequest } from './gate-request.ts'
import { readIdentity, readMembers, stopSessions } from './session.ts'

/** After the main process exits, output that stays quiet this long is complete. */
const quietAfterExitMs = 100
/** The bound of one reading of the session reader. */
const readBoundMs = 5_000

const reader = process.argv[2] ?? ''
let detached = false
let paused = false
let request: GateRequest | undefined
let child: ChildProcess | undefined
let went = false
let spawned = false
let exitStatus: Readonly<{ code: number | null; signal: string | null }> | undefined
let openStreams = 2
let quiet: ReturnType<typeof setTimeout> | undefined
let finished = false

function send(frame: Readonly<Record<string, unknown>>): boolean {
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
  if (quiet !== undefined) clearTimeout(quiet)
  for (const stream of streams()) stream.pause()
}

function resume(): void {
  if (!paused) return
  paused = false
  for (const stream of streams()) stream.resume()
  armQuiet()
}

process.stdout.on('error', () => {
  detached = true
  resume()
})
process.stdout.on('drain', resume)

const control = new Socket({ fd: 3, readable: true, writable: false })
control.on('error', () => undefined)

async function finish(): Promise<void> {
  if (finished || exitStatus === undefined) return
  finished = true
  if (quiet !== undefined) clearTimeout(quiet)
  const members = await readMembers({
    reader,
    sessions: [process.pid],
    except: process.pid,
    boundMs: readBoundMs,
  })
  send({
    t: 'exit',
    code: exitStatus.code,
    signal: exitStatus.signal,
    members: members === undefined ? null : members.length,
  })
  // From here on the pipes are drained and discarded; the gate stays until its session is stopped.
  paused = false
  for (const stream of streams()) stream.resume()
  setInterval(() => undefined, 2_147_483_647)
}

function armQuiet(): void {
  if (exitStatus === undefined || paused || finished) return
  if (openStreams === 0) return void finish()
  if (quiet !== undefined) clearTimeout(quiet)
  quiet = setTimeout(() => void finish(), quietAfterExitMs)
}

function forward(stream: Readable, name: 'stdout' | 'stderr', maxChunkBytes: number): void {
  stream.on('data', (chunk: Buffer) => {
    if (finished) return
    for (let at = 0; at < chunk.length; at += maxChunkBytes)
      if (
        !send({ t: 'data', s: name, b: chunk.subarray(at, at + maxChunkBytes).toString('base64') })
      )
        pause()
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
    started.stdin?.end(go.stdin === null ? undefined : Buffer.from(go.stdin, 'base64'))
  })
  started.once('error', error => {
    if (spawned) return
    const code: unknown = Reflect.get(error, 'code')
    send({ t: 'spawnFailed', code: typeof code === 'string' ? code : 'unknown' })
    control.destroy()
  })
  started.once('exit', (code, signal) => {
    exitStatus = { code, signal }
    armQuiet()
  })
  if (started.stdout) forward(started.stdout, 'stdout', go.maxChunkBytes)
  if (started.stderr) forward(started.stderr, 'stderr', go.maxChunkBytes)
}

/** The gate leads its own session: the session id is its own pid. */
async function leadsOwnSession(): Promise<boolean> {
  const identity = await readIdentity({ reader, pid: process.pid, boundMs: readBoundMs })
  return identity?.kind === 'alive' && identity.sid === process.pid
}

async function onControl(line: string): Promise<void> {
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (request === undefined) {
    request = parseGateRequest(message)
    if (request === undefined || reader === '' || !(await leadsOwnSession())) {
      process.stderr.write('omne-host gate: bad request or not leading its own session\n')
      process.exit(2)
    }
    send({ t: 'ready' })
    return
  }
  if (typeof message !== 'object' || message === null) return
  const command: unknown = Reflect.get(message, 'c')
  if (command === 'go' && !went) {
    went = true
    run(request)
  } else if (command === 'term') child?.kill('SIGTERM')
}

let pending = ''
let handling: Promise<void> = Promise.resolve()
control.setEncoding('utf8')
control.on('data', (text: string) => {
  pending += text
  for (let at = pending.indexOf('\n'); at !== -1; at = pending.indexOf('\n')) {
    const line = pending.slice(0, at)
    pending = pending.slice(at + 1)
    handling = handling.then(() => onControl(line))
  }
})
// Without GO the command never started: the gate exits. After GO the provider went away: the gate
// stops every other member of its session, then exits; the manager's own stop needs no gate.
control.on('end', () => {
  void handling.then(async () => {
    if (went)
      await stopSessions({
        reader,
        sessions: [process.pid],
        except: process.pid,
        boundMs: request?.stopBoundMs ?? 10_000,
      })
    process.exit(0)
  })
})
