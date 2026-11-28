import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { filled } from '../script.ts'
import { ended, freePort, ran, until } from './process.ts'

export type ReadCount = Readonly<{
  domain: string
  handler: string
  read: number
  unavailable: number
  cancelled: number
}>

export type CommitCount = Readonly<{
  domain: string
  committed: number
  recalled: number
  rolledBack: number
  unknown: number
  conflicted: number
  rejected: number
  bytes: number
}>

export type Readings = Readonly<{
  reads: readonly ReadCount[]
  commits: readonly CommitCount[]
  participants: readonly Readonly<{ domain: string; participant: string; committed: number }>[]
  queries: readonly Readonly<{ domain: string; answered: number; unknown: number }>[]
}>

export type StepLine = Readonly<{
  request: number
  requestBytes: number
  requestDigest: string
  step: number | null
  storage: Readings
}>

export type Lab = Readonly<{
  server: string
  steps: () => readonly StepLine[]
  readings: () => Promise<Readings>
  entryKinds: () => Promise<readonly string[]>
  script: (script: object) => void
  processorMs: () => number | null
  residentBytes: () => number | null
  stateBytes: () => number
  stop: () => Promise<void>
}>

type Line = Readonly<Record<string, unknown>>

const START_MS = 120_000
const STOP_MS = 30_000

const PORT_FILE = 'port'

async function portOf(directory: string, setUp: (port: number) => Promise<void>): Promise<number> {
  const file = join(directory, PORT_FILE)
  if (existsSync(file)) return Number(readFileSync(file, 'utf8'))
  const port = await freePort()
  await setUp(port)
  writeFileSync(file, String(port))
  return port
}

const TICK_MS = 10

function residentBytesOf(pid: number | undefined): number | null {
  try {
    const found = /^VmRSS:\s+(\d+) kB$/mu.exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'))
    return found === null ? null : Number(found[1]) * 1024
  } catch {
    return null
  }
}

function bytesUnder(directory: string): number {
  let total = 0
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true }))
    if (entry.isFile())
      try {
        total += statSync(join(entry.parentPath, entry.name)).size
      } catch {
        continue
      }
  return total
}

function processorMsOf(pid: number | undefined): number | null {
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return (Number(fields[11]) + Number(fields[12])) * TICK_MS
  } catch {
    return null
  }
}

const labBin = (root: string): string =>
  join(root, 'apps', 'harness-server', 'dist', 'lab', 'bin.js')

export async function startLab(
  input: Readonly<{
    root: string
    directory: string
    script: object
    files?: Readonly<Record<string, number>>
    compactionTrigger?: string
  }>,
): Promise<Lab> {
  const home = join(input.directory, 'server')
  const workspace = join(input.directory, 'workspace')
  const scriptFile = join(input.directory, 'script.json')
  mkdirSync(workspace, { recursive: true })
  if (!existsSync(join(workspace, 'notes.md')))
    writeFileSync(join(workspace, 'notes.md'), '- one note\n')
  for (const [name, bytes] of Object.entries(input.files ?? {}))
    if (!existsSync(join(workspace, name))) writeFileSync(join(workspace, name), filled(bytes))
  writeFileSync(scriptFile, JSON.stringify(input.script))
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'] ?? '',
    HOME: input.directory,
    USERPROFILE: input.directory,
    OMNE_SERVER_HOME: home,
    NO_COLOR: '1',
  }
  const port = await portOf(input.directory, async chosen => {
    const key = ['sk', 'or', 'v1', 'lab', randomBytes(12).toString('hex')].join('-')
    const setup = await ran(
      process.execPath,
      [labBin(input.root), 'setup', '--port', String(chosen), '--workspace', workspace],
      { cwd: input.directory, env, input: `${key}\n` },
    )
    if (setup.status !== 0) throw new Error(`the lab did not set up: ${setup.stderr.trim()}`)
  })
  const child = spawn(
    process.execPath,
    [
      labBin(input.root),
      'serve',
      '--stop-on-stdin-close',
      '--model-script',
      scriptFile,
      ...(input.compactionTrigger === undefined
        ? []
        : ['--compaction-trigger', input.compactionTrigger]),
    ],
    { cwd: input.directory, env, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const lines: Line[] = []
  let pending = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    pending += chunk
    const parts = pending.split('\n')
    pending = parts.pop() ?? ''
    for (const part of parts) {
      if (!part.startsWith('{')) continue
      try {
        lines.push(JSON.parse(part) as Line)
      } catch {
        continue
      }
    }
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
  child.stdin.on('error', () => {})
  const alive = <T>(value: T | undefined): T | undefined => {
    if (child.exitCode !== null)
      throw new Error(`the lab ended with ${String(child.exitCode)}: ${stderr.trim().slice(-2000)}`)
    return value
  }
  await until(
    () => alive(lines.find(line => line['accepting'] === true)),
    'the lab to accept',
    START_MS,
  )
  const of = (kind: string): Line[] => lines.filter(line => line['kind'] === kind)
  return {
    server: `http://127.0.0.1:${String(port)}`,
    steps: () => of('lab-step') as unknown as StepLine[],
    readings: async () => {
      const before = of('lab-storage').length
      child.stdin.write('readings\n')
      const line = await until(
        () => alive(of('lab-storage')[before]),
        'the readings of the lab',
        STOP_MS,
      )
      if (line['ok'] !== true) throw new Error(`the lab has no readings: ${String(line['error'])}`)
      return line['storage'] as Readings
    },
    entryKinds: async () => {
      child.stdin.write('entry-kinds\n')
      const line = await until(() => alive(of('lab-entry-kinds')[0]), 'the entry kinds', STOP_MS)
      return line['kinds'] as readonly string[]
    },
    script: script => writeFileSync(scriptFile, JSON.stringify(script)),
    processorMs: () => processorMsOf(child.pid),
    residentBytes: () => residentBytesOf(child.pid),
    stateBytes: () => bytesUnder(home),
    stop: async () => {
      child.stdin.end()
      const timer = setTimeout(() => child.kill('SIGKILL'), STOP_MS)
      await ended(child)
      clearTimeout(timer)
    },
  }
}
