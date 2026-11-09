// R9 line-internal flow, shared pieces: the operator layer for the release tree, a handle on a real
// `dist/bin.js serve` process, the `omne` CLI as a process, and the search for secrets in output.
// No vitest import: `drive.ts` (the `run-r9.sh` driver) uses this file too.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURSOR_KEY_FILE } from '../../src/entry/cursor-signing.ts'
import { LOCAL_TOKENIZERS } from '../../src/local/operator-defaults.ts'
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
/** The adoption every test value of the model rows names; a test parameter, not a release value. */
const MODEL_TEST_ADOPTION = {
  owner: 'harness-server-test',
  name: 'model-rows',
  revision: '1',
  digest: '0'.repeat(64),
}

/**
 * The operator values of the model rows whose numbers the release layer does not write (R2-D6:
 * the first production values follow "E9 initial value times 1.5, then the curve of the first
 * measurement"; there is no E9 table yet). These are test values: they let the release tree load
 * and the rows construct; no measurement backs them. `records` and `host` share
 * `resultPageTargetBytes` and `readIdleMs`, `records.sendStage.preparation` equals `preparation`,
 * and `records.sendStage.profiles` equals `profiles` (the load-time cross-row checks).
 */
/**
 * The Model route when a test gives none: a loopback port that nothing listens on. A test that sends a
 * Model call without the local gateway (`tests/fixtures/model-gateway.ts`) fails on this machine; it
 * never reaches a real supplier (R2-D258).
 */
export const UNUSED_MODEL_ROUTE = 'https://127.0.0.1:9/api/v1/chat/completions'

/** The entry kinds the session diagnostics projection reads (server-entry `PROJECTED_KINDS`). */
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
      maxSerializedBytes: 4 * 1024 * 1024,
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
    // The consumer owner of every Agent call (`@omne-harness/agent`, loop/identities.ts AGENT_OWNER).
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
      capacity: { bytes: '1000000', blocks: '100', attachmentBytes: '0' },
    },
    // `maxCommandBytes` is the storage provider's (`providerConfig`); `maxCallBytes` leaves the reserve.
    maxCallBytes: 524_288,
    maxCommandBytes: 1_048_576,
    combinationVersion: 'session-composite/5',
    send: { mirrorBytes: 4_194_304, maxClaims: 8 },
    // The read face `modelDiagnostics` (A12: the operator layer gives what the release does not).
    diagnostics: {
      diagnosticsRead: 'tenant-self',
      retention: { ...MODEL_TEST_ADOPTION, name: 'model-diagnostics-retention' },
    },
    initial: { maxRecords: 1024, maxBindings: 4, maxCallsPerBinding: 1024 },
    sendStage: {
      maxRetainedAttempts: 16,
      materialization: { maxRecords: 16 },
      factoryQueryId: 'factory-openrouter',
      profiles: {
        retryPolicy: profiles.retryPolicy,
        compactionTriggerPercent: profiles.compactionTriggerPercent,
      },
      preparation,
      network: { maxConnections: 4, idleConnectionTimeoutMs: 60_000 },
      routes: {
        openrouter: { url: options.modelRoute ?? UNUSED_MODEL_ROUTE, endMarker: '[DONE]' },
      },
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
    credential: {
      path: join(options.storageRoot, 'model-vault.json'),
      factorySecret: 'r9-test-factory-secret',
    },
  }
}

/**
 * The `agent-host` row of the operator layer. A `replace` swaps the whole row config, so it copies
 * the two release items, `jointCommits` and `coordination`, from the distribution file (R2-D162)
 * and adds the factory numbers and `instanceIdleMs`, which are operator values. These are test
 * values; `loopGuardPolicy` has no production adoption source yet (a named gap, L-RUN wave 3).
 */
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
    reconciliationDelayMs: 0,
    reconciliationBatchLimit: 8,
    denialBackoffMs: 0,
    toolConcurrency: 1,
    loopGuardPolicy: { ...MODEL_TEST_ADOPTION, name: 'loop-guard' },
    instanceIdleMs: 60_000,
  }
}

/** 本机的 shell：可执行文件与把脚本作为最后一个参数传入的前缀参数。 */
export function hostShell(): Readonly<{ executable: string; argsPrefix: string[] }> {
  if (process.platform !== 'win32') return { executable: '/bin/sh', argsPrefix: ['-c'] }
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows'
  return {
    executable: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    argsPrefix: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
  }
}

/**
 * Tool 运行时组、宿主提供者与两个作者的运维者值（测试值）。文件根与宿主状态目录在存储根的父目录下新建；
 * `tool-records` 的 `maxCommandBytes` 与 `storage` 行相同（`providerConfig` 的 1048576），`combinationVersion`
 * 与 `session-storage` 行相同。
 */
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
      Shell: { resultMaxBytes: 32768, ...shell, cwd: filesRoot, env },
      Files: { resultMaxBytes: 32768 },
      Tools: { resultMaxBytes: 65536, outputModalities: ['text'] },
      TodoItems: { resultMaxBytes: 1_048_576 },
      Web: { resultMaxBytes: 32768, maxSearchResults: 10 },
    },
    // The Web provider values of the test operator layer: the local Exa stand-in when a test gives
    // one (`tests/fixtures/exa-stub.ts`), else a loopback port that nothing listens on; short time
    // limits, a small body cap. No test reaches the real Exa.
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
      combinationVersion: 'session-composite/5',
      maxCommandBytes: 1048576,
      maxChunkBytes: 16384,
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
  /** The `https:` URL of the Model route; the local gateway in tests that send a Model call. */
  modelRoute?: string
  /** Replaces the release `maxJsonDepth` of the storage row (the negative control of R2-D270). */
  maxJsonDepth?: number
  /** The `http:` URL of the local Exa stand-in; tests that run a Web search give it. */
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
        // A `replace` swaps the whole row, so it copies the release `maxJsonDepth` (R2-D270).
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
          combinationVersion: 'session-composite/5',
          directoryFile: join(options.storageRoot, 'tenant-domains.json'),
          domainRule: 'organization-account/1',
        },
      },
      // 模型侧五行的配置是机器级参数与运维者的数值：保管库路径、官方档案快照、宿主与记录仓的上限、准备行的家族配置。
      // 写进运维层，不写进发行配置（R2-D6：发行层不写数值默认值）。
      { kind: 'replace', id: 'model-credential', config: model.credential },
      // The secret custody row opens the vault the model credential plugin builds on the same path.
      { kind: 'replace', id: 'secret-custody', config: { path: model.credential.path } },
      { kind: 'replace', id: 'model-tokenizers', config: model.tokenizers },
      { kind: 'replace', id: 'model-profiles', config: model.profiles },
      { kind: 'replace', id: 'model-request-preparation', config: model.preparation },
      { kind: 'replace', id: 'model-host', config: model.host },
      { kind: 'replace', id: 'model-records', config: model.records },
      // Tool 与执行环境各行的数值与路径归运维者层，发行层不写默认值（B3-T2a 第 4 项、Tool B 段）。这里是测试值：
      // 文件根与宿主状态目录在存储根旁边新建；Shell 用本机的 shell（Windows 是 powershell，其余是 /bin/sh）；
      // 运行时组的数值取 L-TOOL C06 组合用例的同一组值（tool-storage-sql windows-composition/assembly.ts）。
      { kind: 'replace', id: 'tool-host', config: { construction: tools.construction } },
      // The release row has no Tools capability and no Web provider values; the test layer adds Web.
      { kind: 'replace', id: 'tool-bindings', config: { web: tools.web } },
      { kind: 'replace', id: 'tool-records', config: tools.records },
      { kind: 'replace', id: 'execution-host', config: tools.host },
      // B1（R2-D136）：Context 侧与 Session 适配行的数值归运维者层，发行层不写。这里是测试值：
      // 账目收件口的上限、agent-context 的采用身份与结果容量、AD-03/AD-04 的索引上界与页大小（成员初值）。
      {
        kind: 'replace',
        id: 'request-context',
        config: { limits: { maxTargets: 64, maxFactsPerTarget: 64, maxRevisionsPerDispatch: 16 } },
      },
      {
        kind: 'replace',
        id: 'agent-context',
        config: {
          // The result capacity of one call is at most `maxCallBytes` of model-records (N1): a larger
          // one is refused at the admission as `capacity` (G-DIALOG layer 9).
          resultCapacity: { bytes: '524288', blocks: '100', attachmentBytes: '0' },
        },
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
      // SC4（R2-D162）：agent-host 换真件后，工厂数值与实例空闲时长归运维者层；整行替换时重抄发行层的两项。
      { kind: 'replace', id: 'agent-host', config: agentHostOperatorConfig() },
      // The session diagnostics projection: every kind it knows, and test bounds (A12).
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
      // 遥测行的预算归运维者层（R2-D229）；`replace` 整行替换，重抄发行层的实现与出口。测试值，未测量。
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

/** The `maxJsonDepth` the release distribution gives the storage row. */
export function releaseMaxJsonDepth(): number {
  const release = JSON.parse(readFileSync(distributionPath, 'utf8')) as {
    rows: { id: string; config: Record<string, unknown> }[]
  }
  const depth = release.rows.find(entry => entry.id === 'storage')?.config['maxJsonDepth']
  if (typeof depth !== 'number') throw new Error('the release storage row gives no maxJsonDepth')
  return depth
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
  /** A PEM file the child trusts in addition (`NODE_EXTRA_CA_CERTS`): the local Model gateway. */
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
  const state = JSON.parse(readFileSync(join(home, 'login.json'), 'utf8')) as {
    loginProof: string
  }
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
