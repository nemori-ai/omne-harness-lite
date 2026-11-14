import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSecretText } from '@omne-harness/settings'
import { createSecretVault } from '@omne-harness/settings-local/secrets'
import { providerCredentialKey, releaseProvider } from '../../src/assets/model-providers.ts'
import { CURSOR_KEY_FILE } from '../../src/entry/cursor-signing.ts'
import { COMBINATION_VERSION } from '../../src/rows/agent-journal/config.ts'
import { LOCAL_TOKENIZERS, LOCAL_TOOL_RESULT_BYTES } from '../../src/local/operator-defaults.ts'
import { providerConfig } from '../rows/storage/fixtures/tree.ts'

export const memberDir = fileURLToPath(new URL('../..', import.meta.url))
export const serverBin = join(memberDir, 'dist', 'bin.js')
export const cliBin = join(memberDir, '..', 'cli', 'dist', 'bin.js')
export const distributionPath = join(memberDir, 'config', 'serve.distribution.json')

export const SHUTDOWN_DEADLINE_MS = 5000
export const READINESS_TIMEOUT_MS = 15_000

export type Rec = { kind: string } & Record<string, unknown>

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
  base: string
  stateRoot: string
  storageRoot: string
  remove(): void
}>

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

const MODEL_TEST_ADOPTION = {
  owner: 'harness-server-test',
  name: 'model-rows',
  revision: '1',
  digest: '0'.repeat(64),
}

export const UNUSED_MODEL_ROUTE = 'https://127.0.0.1:9/api/v1/chat/completions'

export const DIAGNOSTICS_KINDS = [
  'run.started',
  'run.attempt-started',
  'run.attempt-released',
  'run.attempt-exited',
  'control.requested',
  'control.progress',
  'run.terminal',
  'call.bound',
  'call.execution-fact',
  'message.user',
  'message.assistant',
  'message.tool',
  'message.tool_internal',
  'message.system_reminder',
  'message.compaction',
] as const

export function modelRowsOperatorConfig(options: { storageRoot: string; modelRoute?: string }) {
  const profiles = {
    retryPolicy: { owner: 'r9', name: 'retry', revision: '1', digest: '0'.repeat(64) },
    compactionTriggerPercent: '80',
    updatedAt: '2026-11-02T00:00:00Z',
  }
  const preparation = {
    maxCitedCalls: 8,
    openai: {
      limits: {
        toolArguments: {
          maxBytes: 65_536,
          maxDepth: 32,
          maxItems: 1_024,
          maxMembers: 256,
          maxStringLength: 65_536,
          maxNumberLength: 64,
        },
        maxReasoningText: 65_536,
      },
      margin: { percent: '10', source: MODEL_TEST_ADOPTION },
    },
  }
  const host = {
    host: { concurrencyLimit: 4, wakeCapacity: 64, scanBatchSize: 10, scanIntervalMs: 1000 },
    runtime: {
      outputBatchBytes: 16_384,
      outputBatchDelayMs: 100,
      observerBufferBytes: 65_536,
      observerCheckIntervalMs: 25,
      readIdleMs: 1000,
      resultPageTargetBytes: 4096,
      retryBackoffMs: 0,
      cleanupRetryMs: 1000,
    },
    results: {
      maxConcurrentCalls: 4,
      maxRedeliveries: 2,
      maxCleanupSteps: 8,
      maxPendingAccountsPerTenant: 4,
      maxPendingAccounts: 16,
    },
  }
  const records = {
    owners: [
      {
        consumerOwner: '@omne-harness/agent',
        evidence: { ...MODEL_TEST_ADOPTION, name: 'agent-consumer-evidence' },
        work: { kind: 'exempt' },
      },
    ],
    limits: {
      scanPageCalls: 100,
      resultPageParts: 16,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      unacknowledgedResults: 1,
    },
    requestChunkBytes: 65536,
    combinationVersion: COMBINATION_VERSION,
    send: { mirrorBytes: 4_194_304, maxClaims: 8 },
    diagnostics: {
      diagnosticsRead: 'tenant-self',
      retention: { ...MODEL_TEST_ADOPTION, name: 'model-diagnostics-retention' },
    },
    observation: {
      maxSnapshotBytes: 1_048_576,
      maxDeltaBytes: 262_144,
      maxQueuedFrames: 64,
      maxQueuedBytes: 2_097_152,
      maxObserversPerTenant: 4,
      maxObservers: 8,
      maxPendingSourceOperations: 4,
      maxRetainedCalls: 8,
      maxRetainedBytes: 4_194_304,
      maxTotalBytes: 8_388_608,
      maxQueueResidenceMs: 10_000,
      checkIntervalMs: 100,
    },
    initial: { maxRecords: 1024, maxBindings: 4, maxCallsPerBinding: 1024 },
    sendStage: {
      maxRetainedAttempts: 16,
      materialization: { maxRecords: 16 },
      profiles: {
        retryPolicy: profiles.retryPolicy,
        compactionTriggerPercent: profiles.compactionTriggerPercent,
      },
      preparation,
      network: { maxConnections: 4, idleConnectionTimeoutMs: 60_000 },
      endpoints: { openrouter: options.modelRoute ?? UNUSED_MODEL_ROUTE },
      transportLimits: {
        connectTimeoutMs: 5000,
        connectRetry: { backoffMs: [500, 1000] },
        maxErrorBodyBytes: 4096,
        maxEventBytes: 1_048_576,
        json: {
          maxBytes: 1_048_576,
          maxDepth: 64,
          maxItems: 4096,
          maxMembers: 1024,
          maxStringLength: 1_048_576,
          maxNumberLength: 64,
        },
      },
    },
  }
  return {
    tokenizers: LOCAL_TOKENIZERS,
    profiles,
    preparation,
    host,
    records,
    vault: testVaultPath(options.storageRoot),
  }
}

export function testVaultPath(storageRoot: string): string {
  return join(dirname(storageRoot), 'model-vault.json')
}

export const TEST_DEPLOYMENT_KEY = 'r9-test-factory-secret'

export function seedTestVault(path: string): string {
  if (existsSync(path)) return path
  const provider = releaseProvider('openrouter')
  const secret = parseSecretText(TEST_DEPLOYMENT_KEY)
  if (provider === undefined || !secret.ok) throw new Error('the test vault cannot be seeded')
  mkdirSync(dirname(path), { recursive: true })
  const created = createSecretVault({
    path,
    seed: [
      {
        key: providerCredentialKey(provider, { layer: 'official' }, 'apiKey'),
        secret: secret.value,
        configuredAt: null,
      },
    ],
  })
  if (created.kind !== 'open') throw new Error(`the test vault: ${created.kind}`)
  created.vault.close()
  return path
}

function agentHostOperatorConfig(): Record<string, unknown> {
  const release = JSON.parse(readFileSync(distributionPath, 'utf8')) as {
    rows: { id: string; config: Record<string, unknown> }[]
  }
  const row = release.rows.find(entry => entry.id === 'agent-host')
  if (row === undefined) throw new Error('the release has no agent-host row')
  return {
    jointCommits: row.config['jointCommits'],
    coordination: row.config['coordination'],
    observerBufferBytes: 65_536,
    reconciliationDelaysMs: [0],
    reconciliationBatchLimit: 8,
    denialBackoffMs: 0,
    toolConcurrency: 1,
    loopGuardPolicy: { ...MODEL_TEST_ADOPTION, name: 'loop-guard' },
    modelRetry: { maxAttempts: 1, maxElapsedMs: 0, delaysMs: [0], jitter: 0 },
    instanceIdleMs: 60_000,
  }
}

export function hostShell(): Readonly<{ executable: string; argsPrefix: string[] }> {
  if (process.platform !== 'win32') return { executable: '/bin/sh', argsPrefix: ['-c'] }
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows'
  return {
    executable: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    argsPrefix: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
  }
}

export function toolRowsOperatorConfig(options: { storageRoot: string; exaEndpoint?: string }) {
  const base = dirname(options.storageRoot)
  const filesRoot = join(base, 'workspace')
  const stateDirectory = join(base, 'host-files-state')
  mkdirSync(filesRoot, { recursive: true })
  mkdirSync(stateDirectory, { recursive: true })
  const shell = hostShell()
  const systemRoot = process.env['SystemRoot']
  const env =
    process.platform === 'win32' && systemRoot !== undefined
      ? { SystemRoot: systemRoot, WINDIR: systemRoot, TEMP: stateDirectory, TMP: stateDirectory }
      : { PATH: '/usr/bin:/bin', TMPDIR: stateDirectory }
  return {
    filesRoot,
    construction: {
      Shell: { resultMaxBytes: LOCAL_TOOL_RESULT_BYTES, ...shell, cwd: filesRoot, env },
      Files: { resultMaxBytes: LOCAL_TOOL_RESULT_BYTES },
      Tools: { resultMaxBytes: 65536, outputModalities: ['text'] },
      TodoItems: { resultMaxBytes: 1_048_576 },
      Ask: { resultMaxBytes: 1_048_576 },
      Web: { resultMaxBytes: LOCAL_TOOL_RESULT_BYTES, maxSearchResults: 10 },
    },
    web: {
      search: {
        endpoint: options.exaEndpoint ?? 'https://127.0.0.1:9/search',
        type: 'lite',
        highlightChars: 200,
        timeoutMs: 5000,
      },
      fetch: { maxRedirects: 5, timeoutMs: 10_000, maxBodyBytes: 1_048_576 },
    },
    records: {
      filesRoot,
      combinationVersion: COMBINATION_VERSION,
      configuration: {
        authorBufferBytes: 65536,
        authorBufferItems: 256,
        authorWaitHistoryBytes: 65536,
        authorWaitHistoryItems: 32,
        processBatchBytes: 65536,
        processBatchDelayMs: 0,
        observerBufferBytes: 262144,
        resultPageBytes: 65536,
        reconciliationDelayMs: 50,
        ledgerCommitAttempts: 16,
        queueCapacity: 64,
        driverRetryDelayMs: 50,
        driverStepsPerRun: 32,
        offloading: {
          maxInlineUtf8Bytes: 65_536,
          maxRetentionMs: 86_400_000,
          maxBodyBytes: 16_777_216,
          previewUtf8Bytes: 1_024,
          maxPageBytes: 65_536,
          permitMs: 30_000,
          clockSkewMs: 1_000,
          orphanGraceMs: 60_000,
          maxWriterMetadataBytes: 1_048_576,
          jsonDocument: {
            maxBytes: 1_048_576,
            maxDepth: 64,
            maxItems: 65_536,
            maxMembers: 65_536,
            maxStringLength: 1_048_576,
            maxNumberLength: 64,
          },
          jsonRecord: {
            maxBytes: 65_536,
            maxDepth: 32,
            maxItems: 4096,
            maxMembers: 4096,
            maxStringLength: 65_536,
            maxNumberLength: 64,
          },
        },
      },
      capacity: 64,
      observersPerCall: 4,
      observerQueueFrames: 16,
      observerResidenceMs: 5000,
    },
    host: { filesRoot, stateDirectory },
  }
}

export function operatorLayer(options: {
  storageRoot: string
  port: number
  shutdownDeadlineMs?: number
  modelRoute?: string
  maxJsonDepth?: number
  exaEndpoint?: string
}): unknown {
  const deadline = options.shutdownDeadlineMs ?? SHUTDOWN_DEADLINE_MS
  const model = modelRowsOperatorConfig(options)
  const tools = toolRowsOperatorConfig(options)
  return {
    ops: [
      {
        kind: 'replace',
        id: 'storage',
        config: providerConfig(options.storageRoot, {
          closeDeadlineMs: deadline - 1000,
          maxResponseBytes: 131_072,
          maxJsonDepth: options.maxJsonDepth ?? releaseMaxJsonDepth(),
        }),
      },
      {
        kind: 'replace',
        id: 'session-storage',
        config: {
          combinationVersion: COMBINATION_VERSION,
          directoryFile: join(options.storageRoot, 'tenant-domains.json'),
          domainRule: 'organization-account/1',
        },
      },
      { kind: 'replace', id: 'secret-custody', config: { path: seedTestVault(model.vault) } },
      { kind: 'replace', id: 'model-tokenizers', config: model.tokenizers },
      { kind: 'replace', id: 'model-profiles', config: model.profiles },
      { kind: 'replace', id: 'model-request-preparation', config: model.preparation },
      { kind: 'replace', id: 'model-host', config: model.host },
      { kind: 'replace', id: 'model-records', config: model.records },
      { kind: 'replace', id: 'tool-host', config: { construction: tools.construction } },
      {
        kind: 'replace',
        id: 'tool-bindings',
        config: {
          tools: {
            attemptMs: 250,
            resultPageBytes: 65_536,
            replyMaxBytes: 65_536,
            contentPageBytes: 4096,
          },
          web: tools.web,
        },
      },
      { kind: 'replace', id: 'tool-records', config: tools.records },
      {
        kind: 'replace',
        id: 'tool-body-sweep',
        config: {
          combinationVersion: tools.records.combinationVersion,
          ledgerCommitAttempts: tools.records.configuration.ledgerCommitAttempts,
          orphanGraceMs: tools.records.configuration.offloading.orphanGraceMs,
          intervalMs: 1000,
          limit: 100,
        },
      },
      { kind: 'replace', id: 'execution-host', config: tools.host },
      {
        kind: 'replace',
        id: 'request-context',
        config: { limits: { maxTargets: 64, maxFactsPerTarget: 64, maxRevisionsPerDispatch: 16 } },
      },
      {
        kind: 'replace',
        id: 'agent-context',
        config: {},
      },
      {
        kind: 'replace',
        id: 'session-ad03',
        config: { scopeIndexEntries: 4096, pageBytes: 65536 },
      },
      {
        kind: 'replace',
        id: 'session-ad04',
        config: { scopeIndexEntries: 4096, pageBytes: 65536 },
      },
      {
        kind: 'replace',
        id: 'session-access',
        config: {
          ...releaseRowConfig('session-access'),
          requestJournalFile: join(options.storageRoot, 'request-queue.jsonl'),
        },
      },
      { kind: 'replace', id: 'agent-host', config: agentHostOperatorConfig() },
      {
        kind: 'replace',
        id: 'server-entry',
        config: {
          listenPort: options.port,
          diagnosticsKinds: [...DIAGNOSTICS_KINDS],
          maxRuns: 32,
          maxCallsPerRun: 64,
        },
      },
      {
        kind: 'replace',
        id: 'telemetry',
        config: {
          implementation: 'node',
          outlet: { kind: 'stdout' },
          budgets: {
            maxRecordBytes: 65_536,
            maxQueueItems: 1024,
            maxQueueBytes: 1_048_576,
            maxOpenSegments: 16,
            maxLogTextLength: 4096,
            summaryIntervalMs: 1000,
          },
        },
      },
    ],
  }
}

function releaseRowConfig(id: string): Record<string, unknown> {
  const release = JSON.parse(readFileSync(distributionPath, 'utf8')) as {
    rows: { id: string; config: Record<string, unknown> }[]
  }
  return release.rows.find(entry => entry.id === id)?.config ?? {}
}

export function releaseMaxJsonDepth(): number {
  const depth = releaseRowConfig('storage')['maxJsonDepth']
  if (typeof depth !== 'number') throw new Error('the release storage row gives no maxJsonDepth')
  return depth
}

export function writeOperator(path: string, layer: unknown): void {
  writeFileSync(path, JSON.stringify(layer, null, 2), 'utf8')
}

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
  records(): Rec[]
  stdout(): string
  stderr(): string
  stop(): Promise<ServerOutcome>
  kill(): Promise<void>
}>

export function startServer(options: {
  stateRoot: string
  operatorPath: string
  port: number
  startupTimeoutMs?: number
  extraCaPath?: string
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
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...(options.extraCaPath === undefined ? {} : { NODE_EXTRA_CA_CERTS: options.extraCaPath }),
    },
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
  command: readonly string[]
  status: number | null
  stdout: string
  stderr: string
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

export function savedLoginProof(home: string): string {
  const state = JSON.parse(readFileSync(join(home, 'login.json'), 'utf8')) as {
    loginProof: string
  }
  return state.loginProof
}

export function savedTenant(home: string): string {
  const state = JSON.parse(readFileSync(join(home, 'login.json'), 'utf8')) as { tenantId: string }
  return state.tenantId
}

export function cursorKeySpellings(stateRoot: string): string[] {
  const key = readFileSync(join(stateRoot, CURSOR_KEY_FILE))
  return [
    key.toString('hex'),
    key.toString('base64'),
    key.toString('base64url'),
    key.toString('latin1'),
  ]
}

export function leaked(
  haystack: string,
  secrets: Readonly<Record<string, readonly string[]>>,
): string[] {
  return Object.entries(secrets)
    .filter(([, spellings]) => spellings.some(spelling => haystack.includes(spelling)))
    .map(([label]) => label)
}

export function bodyOf(run: CliRun): Record<string, unknown> {
  const body = run.result?.['body']
  if (typeof body !== 'object' || body === null) throw new Error(`no body in: ${run.stdout}`)
  return body as Record<string, unknown>
}
