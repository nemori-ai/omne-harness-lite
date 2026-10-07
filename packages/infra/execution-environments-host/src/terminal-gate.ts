import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { createInterface } from 'node:readline'
import { terminalScript } from './terminal-script.ts'
import { hostTerminalDirectory } from './terminal-directory.ts'
import { recordHostGateEntry } from './native-evidence.ts'

interface Command {
  readonly kind: 'command'
  readonly id: string
  readonly script: string
  readonly cwd?: string
  readonly env?: Record<string, string>
  readonly stdin?: string
}
interface CommandState {
  readonly message: Command
  readonly paths: string[]
  readonly servers: Server[]
  readonly sockets: Set<Socket>
  readonly complete: () => Promise<void>
  streams: number
  marker?: { code: number; cwd: string; sinks: readonly number[] }
  finishing: boolean
}
const coordinate = { unit: process.argv[2]!, boot: process.argv[3]! }
const chunkBytes = Number(process.argv[4]),
  directory = hostTerminalDirectory(coordinate)
let shell: ChildProcess | undefined,
  current: CommandState | undefined,
  writable = true
function send(value: unknown) {
  if (!writable) return false
  return process.stdout.write(JSON.stringify(value) + '\n')
}
function broken(error?: unknown) {
  send({ kind: 'broken', reason: error instanceof Error ? error.message : 'controlInvalid' })
  process.stdin.destroy()
  shell?.stdin?.destroy()
}
async function cgroupMembers() {
  const lines = (await readFile('/proc/self/cgroup', 'utf8')).trim().split('\n')
  const v1 = lines.find(line => line.includes(':name=systemd:'))
  const path = v1
    ? '/sys/fs/cgroup/systemd' + v1.split(':').slice(2).join(':')
    : '/sys/fs/cgroup' + lines.find(line => line.startsWith('0::'))!.slice(3)
  return (await readFile(path + '/cgroup.procs', 'utf8')).trim().split('\n').map(Number)
}
async function hasResidual(): Promise<boolean> {
  for (const pid of await cgroupMembers()) {
    if (pid !== process.pid && pid !== shell?.pid && (await executing(pid))) return true
  }
  return false
}
async function drainSinks(pids: readonly number[]) {
  const deadline = Date.now() + Number(process.argv[5])
  for (const pid of pids) {
    while (await executing(pid)) {
      if (Date.now() >= deadline) return false
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  return true
}
async function disposeCommand(state: CommandState) {
  for (const server of state.servers)
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  for (const path of state.paths) {
    try {
      await unlink(path)
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error
    }
  }
}
async function finish(state: CommandState) {
  if (state.finishing || !state.marker || state.streams !== 2) return
  state.finishing = true
  // Bash can reap a process-substitution job before `wait PID`; pipe EOF alone
  // precedes sink exit. Observe these two original sink processes before completion.
  if (!(await drainSinks(state.marker.sinks)) || (await hasResidual())) {
    broken()
    return
  }
  await disposeCommand(state)
  current = undefined
  send({ kind: 'completed', id: state.message.id, code: state.marker.code, cwd: state.marker.cwd })
}
async function executing(pid: number): Promise<boolean> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z'
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return false
    throw error
  }
}
async function createStream(state: CommandState, stream: 'stdout' | 'stderr', path: string) {
  let connected = false
  const server = createServer(socket => {
    if (connected) {
      socket.destroy()
      broken()
      return
    }
    connected = true
    state.sockets.add(socket)
    socket.on('data', (data: Buffer) => {
      for (let offset = 0; offset < data.length; offset += chunkBytes) {
        if (
          !send({
            kind: 'output',
            id: state.message.id,
            stream,
            data: data.subarray(offset, offset + chunkBytes).toString('base64'),
          })
        )
          for (const active of state.sockets) active.pause()
      }
    })
    socket.on('error', broken)
    socket.on('end', () => {
      socket.end()
      state.sockets.delete(socket)
      state.streams++
      void state.complete().catch(broken)
    })
  })
  state.servers.push(server)
  state.paths.push(path)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
}
async function command(message: Command) {
  if (!shell?.stdin || current || !/^[a-f0-9-]{36}$/.test(message.id))
    throw new Error('Invalid terminal command state')
  const base = `${directory}/${message.id}`
  const state: CommandState = {
    message,
    paths: [base + '.script', base + '.input'],
    servers: [],
    sockets: new Set(),
    streams: 0,
    finishing: false,
    complete: () => finish(state),
  }
  current = state
  await writeFile(base + '.script', message.script + '\n', { flag: 'wx', mode: 0o600 })
  await writeFile(
    base + '.input',
    message.stdin === undefined ? new Uint8Array() : Buffer.from(message.stdin, 'base64'),
    { flag: 'wx', mode: 0o600 },
  )
  await createStream(state, 'stdout', base + '.out')
  await createStream(state, 'stderr', base + '.err')
  shell.stdin.write(terminalScript({ ...message, directory }))
}
function validCompletion(fields: readonly string[], offset: number, size: number) {
  const code = Number(fields[1]),
    sinks = fields.slice(3).map(Number)
  if (
    !/^\d+$/.test(fields[1]!) ||
    code > 255 ||
    offset !== size ||
    sinks.some(pid => !Number.isSafeInteger(pid) || pid < 1)
  )
    throw new Error('Invalid terminal control completion')
  return { code, cwd: fields[2]!, sinks }
}
function receiveMarker(data: Buffer, pending: { value: Buffer }) {
  pending.value = Buffer.concat([pending.value, data])
  if (pending.value.length > 16384) throw new Error('Terminal control frame too large')
  const fields: string[] = []
  let offset = 0
  for (let count = 0; count < 5; count++) {
    const end = pending.value.indexOf(0, offset)
    if (end === -1) return
    fields.push(pending.value.subarray(offset, end).toString('utf8'))
    offset = end + 1
  }
  if (!current || current.marker || fields[0] !== current.message.id)
    throw new Error('Terminal control identity mismatch')
  current.marker = validCompletion(fields, offset, pending.value.length)
  pending.value = Buffer.alloc(0)
  void current.complete().catch(broken)
}
async function initialize(message: { cwd: string; env: Record<string, string> }) {
  await mkdir(directory, { mode: 0o700 })
  await writeFile(directory + '/identity', `${coordinate.boot}:${coordinate.unit}`, {
    flag: 'wx',
    mode: 0o600,
  })
  shell = spawn('/bin/bash', ['--noprofile', '--norc'], {
    cwd: message.cwd,
    env: message.env,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  })
  shell.on('error', broken)
  shell.on('close', broken)
  shell.stdin!.on('error', broken)
  shell.stdout!.on('data', () => broken(new Error('Unexpected shell control stdout')))
  shell.stderr!.on('data', (data: Buffer) =>
    broken(new Error(`Shell control stderr: ${data.toString('utf8').slice(0, 1024)}`)),
  )
  const pending = { value: Buffer.alloc(0) }
  const control = shell.stdio[3]
  if (!control || !('on' in control)) throw new Error('Terminal control pipe unavailable')
  control.on('data', (data: Buffer) => {
    try {
      receiveMarker(data, pending)
    } catch {
      broken()
    }
  })
  control.on('end', broken)
  await new Promise<void>((resolve, reject) => {
    shell!.once('spawn', resolve)
    shell!.once('error', reject)
  })
  send({ kind: 'created', cwd: message.cwd })
}
async function gate() {
  if (!(await readFile('/proc/self/cgroup', 'utf8')).includes('/' + coordinate.unit))
    throw new Error('Terminal scope mismatch')
  await recordHostGateEntry(coordinate)
  process.stdout.on('error', () => {
    writable = false
  })
  process.stdout.on('drain', () => {
    for (const socket of current?.sockets ?? []) socket.resume()
  })
  send({ kind: 'ready' })
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of input) {
    const message = JSON.parse(line) as Command & { env: Record<string, string>; cwd: string }
    if (!shell && (message.kind as string) === 'go') await initialize(message)
    else await command(message)
  }
  shell?.stdin?.destroy()
}
if (process.argv[1] === new URL(import.meta.url).pathname) void gate().catch(broken)
