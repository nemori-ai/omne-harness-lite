import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))
export const repoRoot = resolve(here, '..', '..')
export const serverMember = join(repoRoot, 'apps', 'harness-server')
export const cliMember = join(repoRoot, 'apps', 'cli')
export const serverBin = join(serverMember, 'dist', 'bin.js')
export const cliBin = join(cliMember, 'dist', 'bin.js')
export const s0Distribution = join(serverMember, 'config', 's0.distribution.json')
export const serveDistribution = join(serverMember, 'config', 'serve.distribution.json')

export const SHUTDOWN_DEADLINE_MS = 5000

export function holdTestSlot(scriptUrl) {
  if (process.env['OMNE_TEST_SLOT_HELD']) return
  const child = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'scripts', 'with-test-slot.mjs'),
      process.execPath,
      fileURLToPath(scriptUrl),
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  )
  process.exit(child.status ?? 1)
}
export const READINESS_TIMEOUT_MS = 15_000

export const SESSION_PATH = '/session-public/1'
export const GOVERNANCE_PATH = '/governance-public/1'

export const PASS = 'pass'
export const FAIL = 'fail'
export const BLOCKED = 'blocked'

export function verdict(step, name, state, detail, awaiting) {
  return awaiting === undefined
    ? { step, name, state, detail }
    : { step, name, state, detail, awaiting }
}

export const failureCount = checks => checks.filter(entry => entry.state === FAIL).length
export const blockedCount = checks => checks.filter(entry => entry.state === BLOCKED).length

export function exitCodeOf(checks) {
  if (failureCount(checks) > 0) return 1
  if (blockedCount(checks) > 0) return 3
  return 0
}

export function report(title, checks, evidenceDir, extra = {}) {
  const bad = failureCount(checks)
  const waiting = blockedCount(checks)
  process.stdout.write(`\n${title}\n\n`)
  for (const entry of checks) {
    const mark = entry.state === PASS ? 'PASS' : entry.state === FAIL ? 'FAIL' : 'WAIT'
    process.stdout.write(`${mark} [${entry.step}] ${entry.name}\n`)
    if (entry.state === PASS) continue
    process.stdout.write(`     ${entry.detail}\n`)
    if (entry.awaiting !== undefined) process.stdout.write(`     等：${entry.awaiting}\n`)
  }
  process.stdout.write(
    `\n合计 ${String(checks.length)} 项：通过 ${String(checks.length - bad - waiting)}，` +
      `失败 ${String(bad)}，等件 ${String(waiting)}\n`,
  )
  mkdirSync(evidenceDir, { recursive: true })
  const record = { title, startedAt: new Date().toISOString(), head: headOf(), checks, ...extra }
  const path = join(evidenceDir, `${title}.json`)
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  process.stdout.write(`记录：${path}\n`)
  return exitCodeOf(checks)
}

export function headOf() {
  const run = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' })
  return run.status === 0 ? run.stdout.trim() : 'unknown'
}

export function missingBuild() {
  const missing = []
  if (!existsSync(serverBin)) missing.push(serverBin)
  if (!existsSync(cliBin)) missing.push(cliBin)
  return missing
}

export function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => resolvePort(port))
    })
  })
}

export function newScratch(prefix = 'joint-a-') {
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

export function storageConfig(storageRoot, closeDeadlineMs) {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    admissionWaitMs: 1000,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    // maxJsonDepth 须不小于 69：首条输入的 Session create 有 69 层，提供者初值 64 会以 command_limit 拒绝。
    maxJsonDepth: 128,
    maxJsonMembers: 65536,
    maxResponseBytes: 65536,
    maxOperationResponseBytes: 1048576,
    globalWriteResponseBytes: 33554432,
    maxDiagnosticBytes: 4096,
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 1000,
    maxReadInputBytes: 262144,
    maxReadResultBytes: 20971520,
    globalReadResultBytes: 268435456,
    readObservationMs: 2000,
    readerIdleMs: 30000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 1,
    groupMaxInputBytes: 4194304,
    groupMaxResponseReservationBytes: 8388608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 67108864,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs,
  }
}

export function operatorLayer(options) {
  const deadline = options.shutdownDeadlineMs ?? SHUTDOWN_DEADLINE_MS
  return {
    ops: [
      {
        kind: 'replace',
        id: 'storage',
        config: storageConfig(options.storageRoot, deadline - 1000),
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
      {
        kind: 'replace',
        id: 'model-credential',
        config: {
          path: join(options.storageRoot, 'model-vault.json'),
          factorySecret: 'joint-a-test-factory-secret',
        },
      },
      {
        kind: 'replace',
        id: 'secret-custody',
        config: { path: join(options.storageRoot, 'model-vault.json') },
      },
      {
        kind: 'replace',
        id: 'model-profiles',
        config: {
          retryPolicy: {
            owner: 'joint-a',
            name: 'retry',
            revision: '1',
            digest: '0'.repeat(64),
          },
          compactionTriggerPercent: '80',
          updatedAt: '2026-11-02T00:00:00Z',
        },
      },
      { kind: 'replace', id: 'server-entry', config: { listenPort: options.port } },
    ],
  }
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}

export const parseRecords = stdout =>
  stdout
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line))

export function runS0Process(options = {}) {
  const args = [
    serverBin,
    's0',
    '--distribution',
    options.distribution ?? s0Distribution,
    '--readiness-timeout-ms',
    String(READINESS_TIMEOUT_MS),
    '--shutdown-deadline-ms',
    String(SHUTDOWN_DEADLINE_MS),
  ]
  const run = spawnSync(process.execPath, args, {
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: READINESS_TIMEOUT_MS + 20_000,
  })
  return {
    args,
    status: run.status,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    records: parseRecords(run.stdout ?? ''),
  }
}

export function startServer(options) {
  const args = [
    serverBin,
    'serve',
    '--distribution',
    options.distribution ?? serveDistribution,
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
  child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk))
  child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk))
  child.stdin.on('error', () => {})
  const closed = new Promise(resolveClose => child.on('close', code => resolveClose(code)))
  const outcome = async () => ({
    code: await closed,
    records: parseRecords(stdout),
    stdout,
    stderr,
  })
  const handle = {
    args,
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
  return new Promise((resolveStart, reject) => {
    const fail = why => {
      killTree(child)
      reject(new Error(`${why}\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }
    const timer = setTimeout(
      () => fail('serve 在上限内没有写出 startup-result'),
      READINESS_TIMEOUT_MS + 10_000,
    )
    const poll = setInterval(() => {
      if (!stdout.includes('"kind":"startup-result"')) return
      clearTimeout(timer)
      clearInterval(poll)
      resolveStart(handle)
    }, 20)
    child.once('error', error => {
      clearTimeout(timer)
      clearInterval(poll)
      fail(`serve 没有起来：${error.message}`)
    })
    void closed.then(code => {
      if (stdout.includes('"kind":"startup-result"')) return
      clearTimeout(timer)
      clearInterval(poll)
      fail(`serve 在启动前退出，退出码 ${String(code)}`)
    })
  })
}

export function runOmne(options) {
  const env = {
    PATH: process.env['PATH'] ?? '',
    HOME: options.cwd,
    USERPROFILE: options.cwd,
    OMNE_HOME: options.home,
    OMNE_SERVER: options.server,
    NO_COLOR: '1',
  }
  const run = spawnSync(process.execPath, [cliBin, ...options.args], {
    env,
    cwd: options.cwd,
    input: options.credential ?? '',
    encoding: 'utf8',
    timeout: 60_000,
  })
  const stdout = run.stdout ?? ''
  let result
  try {
    result = JSON.parse(stdout)
  } catch {
    result = undefined
  }
  return {
    command: ['omne', ...options.args],
    status: run.status,
    stdout,
    stderr: run.stderr ?? '',
    result,
  }
}

export async function post(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.text() }
}

export function savedLoginProof(home) {
  return JSON.parse(readFileSync(join(home, 'login.json'), 'utf8')).loginProof
}

export function savedTenant(home) {
  return JSON.parse(readFileSync(join(home, 'login.json'), 'utf8')).tenantId
}

export function readHistoryRequest(tenant, session, loginProof, options = {}) {
  return {
    protocolVersion: 'session-public/1',
    messageId: options.messageId ?? 'joint-a-read-history',
    operation: 'read-history',
    body: {
      tenant,
      session,
      cursor: options.cursor ?? null,
      direction: options.direction ?? 'forward',
      pageBytes: options.pageBytes ?? '65536',
    },
    loginProof,
  }
}

export function isDenied(reply) {
  if (reply === undefined) return false
  if (reply.status !== 200 && reply.status !== 403) return false
  try {
    return JSON.parse(reply.body)?.outcome === 'denied'
  } catch {
    return false
  }
}

export function isSucceeded(reply) {
  if (reply === undefined || reply.status !== 200) return false
  try {
    return JSON.parse(reply.body)?.outcome === 'succeeded'
  } catch {
    return false
  }
}

export function replyOf(reply) {
  try {
    return JSON.parse(reply.body)
  } catch {
    return undefined
  }
}

export function notActive(records) {
  return records
    .filter(record => record.kind === 'row-state' && record.state !== 'ACTIVE')
    .map(record => `${String(record.id)}:${String(record.state)}`)
}

export function implementations(records) {
  const startup = records.find(record => record.kind === 'startup-result')
  if (startup?.implementations !== undefined) return startup.implementations
  const counts = {}
  for (const record of records) {
    if (record.kind !== 'tree' || record.disabled === true) continue
    const key = String(record.implementation)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export function doubleRows(records) {
  return records
    .filter(record => record.kind === 'tree' && record.disabled !== true)
    .filter(record => record.implementation !== 'real')
    .map(record => `${String(record.id)}(${String(record.implementation)})`)
}

export function evidenceDirFor(title, override) {
  return override ?? join(repoRoot, 'tmp', 'm2-joint-a', title)
}
