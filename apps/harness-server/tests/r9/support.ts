// R9 line-internal flow, shared pieces: the operator layer for the release tree, a handle on a real
// `dist/bin.js serve` process, the `omne` CLI as a process, and the search for secrets in output.
// No vitest import: `drive.ts` (the `run-r9.sh` driver) uses this file too.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURSOR_KEY_FILE } from '../../src/entry/cursor-signing.ts'
import { providerConfig } from '../rows/storage/fixtures/tree.ts'

export const memberDir = fileURLToPath(new URL('../..', import.meta.url))
export const serverBin = join(memberDir, 'dist', 'bin.js')
export const cliBin = join(memberDir, '..', 'cli', 'dist', 'bin.js')
export const distributionPath = join(memberDir, 'config', 'serve.distribution.json')

/** The shutdown deadline handed to `serve`. The storage close deadline stays below it. */
export const SHUTDOWN_DEADLINE_MS = 5000
export const READINESS_TIMEOUT_MS = 15_000

export type Rec = { kind: string } & Record<string, unknown>

/** A port that was free a moment ago. `server-entry` does not take port 0, so the flow picks one first. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

export type Scratch = Readonly<{
  /** The directory that holds everything below. */
  base: string
  /** `--state-root`: exists, absolute. */
  stateRoot: string
  /** The storage root the operator layer gives to the `storage` row. */
  storageRoot: string
  remove(): void
}>

/** A fresh base with a state root and an own storage root inside it. */
export function newScratch(prefix = 'r9-'): Scratch {
  const base = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  const stateRoot = join(base, 'state')
  mkdirSync(stateRoot)
  return {
    base,
    stateRoot,
    storageRoot: join(stateRoot, 'storage'),
    remove: () => rmSync(base, { recursive: true, force: true }),
  }
}

/**
 * The operator layer for the release tree: the three rows whose configuration holds an absolute
 * path or a port. The distribution file keeps neither (decision L1-12).
 */
export function operatorLayer(options: {
  storageRoot: string
  port: number
  shutdownDeadlineMs?: number
}): unknown {
  const deadline = options.shutdownDeadlineMs ?? SHUTDOWN_DEADLINE_MS
  return {
    ops: [
      {
        kind: 'replace',
        id: 'storage',
        config: providerConfig(options.storageRoot, { closeDeadlineMs: deadline - 1000 }),
      },
      {
        kind: 'replace',
        id: 'session-storage',
        config: {
          combinationVersion: 'session-composite/1',
          directoryFile: join(options.storageRoot, 'tenant-domains.json'),
          domainRule: 'organization-account/1',
        },
      },
      { kind: 'replace', id: 'server-entry', config: { listenPort: options.port } },
    ],
  }
}

export function writeOperator(path: string, layer: unknown): void {
  writeFileSync(path, JSON.stringify(layer, null, 2), 'utf8')
}

/** Ends a child and everything it started. Windows needs `taskkill /T`: `kill` leaves orphans. */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}

const parseRecords = (stdout: string): Rec[] =>
  stdout
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line) as Rec)

export type ServerOutcome = Readonly<{
  code: number | null
  records: Rec[]
  stdout: string
  stderr: string
}>

export type ServerHandle = Readonly<{
  port: number
  /** Records seen so far. */
  records(): Rec[]
  stdout(): string
  stderr(): string
  /** An ordered stop: closes stdin, waits for the exit. */
  stop(): Promise<ServerOutcome>
  /** Ends the whole process tree at once. Idempotent. */
  kill(): Promise<void>
}>

/**
 * Starts `node dist/bin.js serve` on the release distribution with the operator file, and resolves
 * when `startup-result` has been written. Rejects, with the output so far, when the process ends first
 * or the deadline passes.
 */
export function startServer(options: {
  stateRoot: string
  operatorPath: string
  port: number
  startupTimeoutMs?: number
}): Promise<ServerHandle> {
  const args = [
    serverBin,
    'serve',
    '--distribution',
    distributionPath,
    '--operator',
    options.operatorPath,
    '--readiness-timeout-ms',
    String(READINESS_TIMEOUT_MS),
    '--shutdown-deadline-ms',
    String(SHUTDOWN_DEADLINE_MS),
    '--state-root',
    options.stateRoot,
    '--stop-on-stdin-close',
  ]
  const child = spawn(process.execPath, args, {
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
  child.stdin.on('error', () => {})
  const closed = new Promise<number | null>(resolve => child.on('close', code => resolve(code)))
  const outcome = async (): Promise<ServerOutcome> => ({
    code: await closed,
    records: parseRecords(stdout),
    stdout,
    stderr,
  })
  const handle: ServerHandle = {
    port: options.port,
    records: () => parseRecords(stdout),
    stdout: () => stdout,
    stderr: () => stderr,
    stop: () => {
      child.stdin.end()
      return outcome()
    },
    kill: async () => {
      killTree(child)
      await closed
    },
  }
  return new Promise((resolve, reject) => {
    const fail = (why: string) => {
      killTree(child)
      reject(new Error(`${why}\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }
    const timer = setTimeout(
      () => fail('serve did not report startup in time'),
      options.startupTimeoutMs ?? READINESS_TIMEOUT_MS + 10_000,
    )
    const poll = setInterval(() => {
      if (stdout.includes('"kind":"startup-result"')) {
        clearTimeout(timer)
        clearInterval(poll)
        resolve(handle)
      }
    }, 20)
    child.once('error', error => {
      clearTimeout(timer)
      clearInterval(poll)
      fail(`serve did not start: ${error.message}`)
    })
    void closed.then(code => {
      if (stdout.includes('"kind":"startup-result"')) return
      clearTimeout(timer)
      clearInterval(poll)
      fail(`serve exited with ${String(code)} before startup`)
    })
  })
}

export type CliRun = Readonly<{
  /** The command line without the credential (it goes to stdin). */
  command: readonly string[]
  status: number | null
  stdout: string
  stderr: string
  /** The parsed result object of the CLI, when stdout holds one. */
  result: Record<string, unknown> | undefined
}>

/** One `omne` process. The credential, when given, goes to stdin and never into the command line. */
export function runOmne(options: {
  args: readonly string[]
  home: string
  server: string
  credential?: string
  cwd: string
}): Promise<CliRun> {
  const env: Record<string, string> = {
    PATH: process.env['PATH'] ?? '',
    HOME: options.cwd,
    USERPROFILE: options.cwd,
    OMNE_HOME: options.home,
    OMNE_SERVER: options.server,
  }
  // Windows sockets need the system directory; it carries no state of this repository.
  const systemRoot = process.env['SystemRoot']
  if (systemRoot !== undefined) env['SystemRoot'] = systemRoot
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliBin, ...options.args], { cwd: options.cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', status => {
      let result: Record<string, unknown> | undefined
      try {
        const parsed: unknown = JSON.parse(stdout)
        if (typeof parsed === 'object' && parsed !== null)
          result = parsed as Record<string, unknown>
      } catch {
        result = undefined
      }
      resolve({ command: ['omne', ...options.args], status, stdout, stderr, result })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(options.credential === undefined ? '' : `${options.credential}\n`)
  })
}

/** The login proof that `omne login` saved in a state directory. Only tests and the driver read it. */
export function savedLoginProof(home: string): string {
  const state = JSON.parse(readFileSync(join(home, 'login.json'), 'utf8')) as { loginProof: string }
  return state.loginProof
}

/** The tenant text that `omne login` saved in a state directory. */
export function savedTenant(home: string): string {
  const state = JSON.parse(readFileSync(join(home, 'login.json'), 'utf8')) as { tenantId: string }
  return state.tenantId
}

/**
 * Every spelling in which the cursor signing key could appear in text: the file is 32 raw bytes,
 * so the spellings are hex, base64, base64url and the latin1 text of the bytes.
 */
export function cursorKeySpellings(stateRoot: string): string[] {
  const key = readFileSync(join(stateRoot, CURSOR_KEY_FILE))
  return [
    key.toString('hex'),
    key.toString('base64'),
    key.toString('base64url'),
    key.toString('latin1'),
  ]
}

/** Which of `secrets` occur in `haystack`. Returns the secrets' labels, never their values. */
export function leaked(
  haystack: string,
  secrets: Readonly<Record<string, readonly string[]>>,
): string[] {
  return Object.entries(secrets)
    .filter(([, spellings]) => spellings.some(spelling => haystack.includes(spelling)))
    .map(([label]) => label)
}

/** `omne` result body of a successful command. */
export function bodyOf(run: CliRun): Record<string, unknown> {
  const body = run.result?.['body']
  if (typeof body !== 'object' || body === null) throw new Error(`no body in: ${run.stdout}`)
  return body as Record<string, unknown>
}
