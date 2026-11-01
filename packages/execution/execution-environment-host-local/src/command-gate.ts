// The gate process of one host command. `systemd-run --scope` starts it inside the command's own
// scope unit; the provider's manager talks to it over two private channels:
// - control, file descriptor 3, manager to gate, one JSON object per line: first the request, then
//   `{"c":"go"}` at most once, and `{"c":"term"}` for a graceful stop;
// - frames, standard output, gate to manager, one JSON object per line: `ready`, then `started` or
//   `spawnFailed`, then `data` frames, then one `exit`.
// The gate checks that it runs in its own unit before it reports ready, starts the command only on
// GO, gives it only the requested environment, and pauses the command's pipes while its frame pipe
// is full, so the bytes waiting between command and manager stay bounded. It is a script: nothing
// imports it. It uses Node built-ins only.
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Socket } from 'node:net'
import type { Readable } from 'node:stream'

type GateRequest = Readonly<{
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  /** Standard input bytes in base64, or null for none. */
  stdin: string | null
  maxChunkBytes: number
}>

/** After the main process exits, output that stays quiet this long is complete. */
const quietAfterExitMs = 100

const unit = process.argv[2] ?? ''
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

// A manager that went away leaves the command running; the gate keeps draining its pipes.
process.stdout.on('error', () => {
  detached = true
  resume()
})
process.stdout.on('drain', resume)

const control = new Socket({ fd: 3, readable: true, writable: false })
control.on('error', () => undefined)

function finish(): void {
  if (finished || exitStatus === undefined) return
  finished = true
  if (quiet !== undefined) clearTimeout(quiet)
  send({ t: 'exit', code: exitStatus.code, signal: exitStatus.signal })
  for (const stream of streams()) stream.destroy()
  control.destroy()
}

function armQuiet(): void {
  if (exitStatus === undefined || paused || finished) return
  if (openStreams === 0) return finish()
  if (quiet !== undefined) clearTimeout(quiet)
  quiet = setTimeout(finish, quietAfterExitMs)
}

function forward(stream: Readable, name: 'stdout' | 'stderr', maxChunkBytes: number): void {
  stream.on('data', (chunk: Buffer) => {
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

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string')
  )
}

function parseRequest(value: unknown): GateRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const executable: unknown = Reflect.get(value, 'executable')
  const args: unknown = Reflect.get(value, 'args')
  const cwd: unknown = Reflect.get(value, 'cwd')
  const env: unknown = Reflect.get(value, 'env')
  const stdin: unknown = Reflect.get(value, 'stdin')
  const maxChunkBytes: unknown = Reflect.get(value, 'maxChunkBytes')
  if (typeof executable !== 'string' || typeof cwd !== 'string') return undefined
  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string')) return undefined
  if (!isStringRecord(env) || (stdin !== null && typeof stdin !== 'string')) return undefined
  if (
    typeof maxChunkBytes !== 'number' ||
    !Number.isSafeInteger(maxChunkBytes) ||
    maxChunkBytes < 1
  )
    return undefined
  return { executable, args, cwd, env, stdin, maxChunkBytes }
}

function inOwnScope(): boolean {
  try {
    return readFileSync('/proc/self/cgroup', 'utf8')
      .split('\n')
      .some(line => line.startsWith('0::') && line.split('/').at(-1) === unit)
  } catch {
    return false
  }
}

function onControl(line: string): void {
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (request === undefined) {
    request = parseRequest(message)
    if (request === undefined || unit === '' || !inOwnScope()) {
      process.stderr.write('omne-host gate: bad request or not in its own scope\n')
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
control.setEncoding('utf8')
control.on('data', (text: string) => {
  pending += text
  for (let at = pending.indexOf('\n'); at !== -1; at = pending.indexOf('\n')) {
    const line = pending.slice(0, at)
    pending = pending.slice(at + 1)
    onControl(line)
  }
})
// Without GO the command never starts: a closed control channel ends the gate.
control.on('end', () => {
  if (!went) process.exit(0)
})
