// 联调 B 的运维者层。
//
// 联调 A 的 `operatorLayer`（`../joint-a/support.mjs`）只管 A 当时的行；当前发行树上模型侧、Context 侧、
// 工具侧和 Session 适配行的数值也归运维者层（R2-D6：发行层不写数值默认值），缺了任何一项，
// `serve` 会在装载时失败（model-records、request-context、session-ad03、session-ad04 等行 FAILED），
// 起不来。这里在联调 A 那一份上叠加这些行，值抄自 `apps/harness-server/tests/r9/support.ts`
// （本目录不导入产品包与测试夹具，所以抄成字面）。它们是测试值，没有度量支撑。
//
// 对照来源改了要同步这里；新行要运维层配置时，从 `serve` 的 `row-state` 里 FAILED 的 ValidationError 看出缺哪些。
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { operatorLayer as baseOperatorLayer } from '../joint-a/support.mjs'

// 会话存储组合的版本：发行层 `session-handoff`、`agent-journal` 与此相同（TOOL-B 起为 /3，R2-D185）。
const COMBINATION_VERSION = 'session-composite/3'

const ADOPTION = {
  owner: 'joint-b',
  name: 'model-rows',
  revision: '1',
  digest: '0'.repeat(64),
}

const PROFILES = {
  retryPolicy: { owner: 'joint-b', name: 'retry', revision: '1', digest: '0'.repeat(64) },
  compactionTriggerPercent: '80',
  updatedAt: '2026-11-02T00:00:00Z',
}

const PREPARATION = {
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
    margin: { percent: '10', source: ADOPTION },
  },
}

const HOST = {
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

const RECORDS = {
  owners: [
    {
      consumerOwner: '@omne-harness/agent',
      evidence: { ...ADOPTION, name: 'agent-consumer-evidence' },
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
  maxCallBytes: 524_288,
  maxCommandBytes: 1_048_576,
  combinationVersion: COMBINATION_VERSION,
  send: { mirrorBytes: 4_194_304, maxClaims: 8 },
  initial: { maxRecords: 1024, maxBindings: 4, maxCallsPerBinding: 1024 },
  sendStage: {
    maxRetainedAttempts: 16,
    materialization: { maxRecords: 16 },
    factoryQueryId: 'factory-openrouter',
    profiles: {
      retryPolicy: PROFILES.retryPolicy,
      compactionTriggerPercent: PROFILES.compactionTriggerPercent,
    },
    preparation: PREPARATION,
    network: { maxConnections: 4, idleConnectionTimeoutMs: 60_000 },
    routes: {
      openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', endMarker: '[DONE]' },
    },
    transportLimits: {
      connectTimeoutMs: 5000,
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

// agent-host 的运维者值（SC4，R2-D162）。`replace` 整行替换，所以发行层的 `jointCommits`、`coordination`
// 要逐字重抄（漏 `message` 会被行 schema 在装载时拒绝）；其余是工厂数值与实例空闲时长，测试值。
// `loopGuardPolicy` 还没有生产采用来源（具名缺件，归 L-RUN 波 3），这里是测试采用。
// `reconciliationDelayMs`、`denialBackoffMs` 取 agent-host-local `docs/cordis.md` 示例的 1000：Agent 在 I1 等依赖时
// 按这个间隔重查，取 0 会约每 9 ms 重跑一遍（R2-D209）。
const AGENT_HOST = {
  jointCommits: ['message', 'context-transition', 'custody', 'processed'],
  coordination: 'coordinated',
  observerBufferBytes: 65_536,
  reconciliationDelayMs: 1000,
  reconciliationBatchLimit: 8,
  denialBackoffMs: 1000,
  toolConcurrency: 1,
  loopGuardPolicy: { ...ADOPTION, name: 'loop-guard' },
  instanceIdleMs: 60_000,
}

/**
 * Shell 的构造值：宿主上真实的 shell（R2-D156、R2-D169），按 L-TOOL 已有的执行环境约定。
 * Windows 取系统自带的 Windows PowerShell，参数与环境同 tool-storage-sql 的 Windows 组合用例
 * （`tests/windows-composition/assembly.ts`、`authors.ts`）；其余平台取 `/bin/bash -c`。
 * 工作目录是执行环境的文件根，临时目录指向宿主状态目录。
 */
function shellConstruction(filesRoot, stateDirectory) {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
    return {
      resultMaxBytes: 65536,
      executable: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      argsPrefix: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
      cwd: filesRoot,
      env: {
        SystemRoot: systemRoot,
        WINDIR: systemRoot,
        TEMP: stateDirectory,
        TMP: stateDirectory,
      },
    }
  }
  return {
    resultMaxBytes: 65536,
    executable: '/bin/bash',
    argsPrefix: ['-c'],
    cwd: filesRoot,
    env: { PATH: '/usr/bin:/bin', TMPDIR: stateDirectory },
  }
}

/**
 * Tool 运行时组与执行宿主的运维者值（TOOL-B，R2-D185），抄自 `apps/harness-server/tests/r9/support.ts`
 * 的 `toolRowsOperatorConfig`，测试值。文件根与宿主状态目录建在存储根的父目录下（绝对路径）；
 * `tool-records` 的 `maxCommandBytes` 与 `storage` 行相同，`combinationVersion` 与 `session-storage` 行相同。
 */
function toolRows(storageRoot) {
  const base = dirname(storageRoot)
  const filesRoot = join(base, 'workspace')
  const stateDirectory = join(base, 'host-files-state')
  mkdirSync(filesRoot, { recursive: true })
  mkdirSync(stateDirectory, { recursive: true })
  return {
    construction: {
      Shell: shellConstruction(filesRoot, stateDirectory),
      Files: { resultMaxBytes: 65536 },
    },
    records: {
      filesRoot,
      combinationVersion: COMBINATION_VERSION,
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

/**
 * 联调 B 用的运维者层：联调 A 的一份之上，覆盖或加上模型侧、Context 侧、工具侧、Session 适配行的值。
 * `historyKinds` 给了就写进 `server-entry`（`read-history` 默认只列用户与助手消息）。
 * Shell 与 Files 的 `construction` 都在 `tool-host` 行；Shell 取宿主上真实的 shell，见 `shellConstruction`。
 */
export function operatorLayerB(options) {
  const base = baseOperatorLayer(options)
  const tools = toolRows(options.storageRoot)
  const replaced = new Map([
    [
      'session-storage',
      {
        combinationVersion: COMBINATION_VERSION,
        directoryFile: join(options.storageRoot, 'tenant-domains.json'),
        domainRule: 'organization-account/1',
      },
    ],
    [
      'model-credential',
      {
        path: join(options.storageRoot, 'model-vault.json'),
        // 联调不读真实供应商凭据：这个值只用来建立保管库文件。
        factorySecret: 'joint-b-test-factory-secret',
      },
    ],
    ['model-profiles', PROFILES],
    ['model-request-preparation', PREPARATION],
    ['model-host', HOST],
    ['model-records', RECORDS],
    ['tool-host', { construction: tools.construction }],
    ['tool-records', tools.records],
    ['execution-host', tools.host],
    [
      'request-context',
      { limits: { maxTargets: 64, maxFactsPerTarget: 64, maxRevisionsPerDispatch: 16 } },
    ],
    [
      'agent-context',
      {
        resultCapacity: { bytes: '1000000', blocks: '100', attachmentBytes: '0' },
      },
    ],
    ['agent-host', AGENT_HOST],
    ['session-ad03', { scopeIndexEntries: 4096, pageBytes: 65536 }],
    ['session-ad04', { scopeIndexEntries: 4096, pageBytes: 65536 }],
    [
      'server-entry',
      {
        listenPort: options.port,
        ...(options.historyKinds === undefined ? {} : { historyKinds: options.historyKinds }),
      },
    ],
  ])
  const ops = base.ops.map(op =>
    replaced.has(op.id) ? { ...op, config: replaced.get(op.id) } : op,
  )
  const present = new Set(ops.map(op => op.id))
  for (const [id, config] of replaced)
    if (!present.has(id)) ops.push({ kind: 'replace', id, config })
  return { ops }
}
