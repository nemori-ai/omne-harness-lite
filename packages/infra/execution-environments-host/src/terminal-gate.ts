import { randomUUID } from 'node:crypto'
import { readFile, readlink, writeFile, unlink } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { spawn, type IPty } from 'node-pty'
import { terminalScript } from './terminal-script.ts'
import { createHostResourceDirectory, hostResourceDirectory } from './resource-directory.ts'
import { recordHostGateEntry } from './native-evidence.ts'
import { readHostProcessStat } from './process-observation.ts'
import { createTerminalReceipt } from './terminal-receipt.ts'
import { forwardPtyOutput } from './pty-output.ts'

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
  finishing: boolean
}
const coordinate = { unit: process.argv[2]!, boot: process.argv[3]! }
const chunkBytes = Number(process.argv[4]),
  cols = Number(process.argv[5]),
  rows = Number(process.argv[6])
const directory = hostResourceDirectory(coordinate)
let shell: IPty | undefined,
  current: CommandState | undefined,
  parser: ReturnType<typeof createTerminalReceipt> | undefined,
  transport: ReturnType<typeof forwardPtyOutput> | undefined,
  writable = true,
  valid = true,
  initialized = false
function send(value: unknown) {
  return writable && process.stdout.write(JSON.stringify(value) + '\n')
}
function broken(error?: unknown) {
  if (!valid) return
  valid = false
  send({ kind: 'broken', reason: error instanceof Error ? error.message : 'controlInvalid' })
  process.stdin.destroy()
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
    if (pid === process.pid || pid === shell?.pid) continue
    const stat = await readHostProcessStat(pid)
    if (stat && stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z') return true
  }
  return false
}
async function finish(state: CommandState, code: number) {
  if (state.finishing) throw new Error('Duplicate terminal completion')
  state.finishing = true
  if (await hasResidual()) throw new Error('Residual terminal process')
  const cwd = await readlink(`/proc/${shell!.pid}/cwd`)
  for (const path of state.paths) await unlink(path)
  // The receipt parser remains active during asynchronous observation and disposal.
  if (!valid || current !== state) return
  send({ kind: 'completed', id: state.message.id, code, cwd })
  current = undefined
}
async function command(message: Command) {
  if (!valid || !initialized || !shell || current || !/^[a-f0-9-]{36}$/.test(message.id))
    throw new Error('Invalid terminal command state')
  const base = `${directory}/${message.id}`
  const state: CommandState = { message, paths: [base + '.script', base], finishing: false }
  current = state
  parser = createTerminalReceipt(
    message.id,
    data => transport!.output(data),
    code => {
      void finish(state, code).catch(broken)
    },
  )
  await writeFile(base + '.script', message.script + '\n', { flag: 'wx', mode: 0o600 })
  if (message.stdin !== undefined) {
    state.paths.push(base + '.input')
    await writeFile(base + '.input', Buffer.from(message.stdin, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    })
  }
  await writeFile(base, terminalScript({ ...message, directory }), { flag: 'wx', mode: 0o600 })
  if (valid) shell.write(base + '\n')
}
function controller(id: string) {
  return [
    'exec 3>/dev/tty',
    '/usr/bin/stty -echo || builtin exit',
    `builtin printf '\\033]777;omne;${id};0\\007' >&3`,
    'while IFS= builtin read -r __omne_path; do',
    '  builtin source "$__omne_path" >/dev/tty 2>&1',
    '  __omne_code=$?',
    '  builtin wait',
    '  /usr/bin/stty -echo || builtin exit',
    '  builtin printf "\\033]777;omne;%s;%s\\007" "${__omne_path##*/}" "$__omne_code" >&3',
    'done >/dev/null 2>&1',
  ].join('\n')
}
async function initialize(message: { cwd: string; env: Record<string, string> }) {
  await createHostResourceDirectory(coordinate)
  const id = randomUUID()
  shell = spawn('/bin/bash', ['--noprofile', '--norc', '-c', controller(id)], {
    cwd: message.cwd,
    env: message.env,
    cols,
    rows,
    encoding: null,
  })
  transport = forwardPtyOutput(shell, chunkBytes, send, () => current?.message.id)
  parser = createTerminalReceipt(
    id,
    () => {
      throw new Error('Unexpected terminal startup output')
    },
    code => {
      if (code !== 0 || initialized || !valid) throw new Error('Invalid terminal creation')
      initialized = true
      send({ kind: 'created', cwd: message.cwd })
    },
  )
  shell.onData((data: unknown) => {
    try {
      if (!valid) return
      if (!Buffer.isBuffer(data)) throw new Error('PTY did not deliver bytes')
      parser!.feed(data)
    } catch (error) {
      broken(error)
    }
  })
  shell.onExit(() => broken(new Error('Terminal exited')))
}
async function gate() {
  if ([chunkBytes, cols, rows].some(size => !Number.isSafeInteger(size) || size < 1))
    throw new Error('Invalid terminal geometry')
  if (!(await readFile('/proc/self/cgroup', 'utf8')).includes('/' + coordinate.unit))
    throw new Error('Terminal scope mismatch')
  await recordHostGateEntry(coordinate)
  process.stdout.on('error', () => {
    writable = false
  })
  send({ kind: 'ready' })
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of input) {
    const message = JSON.parse(line) as Command & { env: Record<string, string>; cwd: string }
    if (!shell && (message.kind as string) === 'go') await initialize(message)
    else await command(message)
  }
  shell?.kill()
}
if (process.argv[1] === new URL(import.meta.url).pathname) void gate().catch(broken)
