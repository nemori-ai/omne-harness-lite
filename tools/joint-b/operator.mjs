// 联调 B 的运维者层。
//
// 联调 A 的 `operatorLayer`（`../joint-a/support.mjs`）只管 A 当时的行；当前发行树上模型侧、Context 侧、
// 工具侧和 Session 适配行的数值也归运维者层（R2-D6：发行层不写数值默认值），缺了任何一项，
// `serve` 会在装载时失败（model-records、request-context、session-ad03、session-ad04 等行 FAILED），
// 起不来。这里在联调 A 那一份上叠加这些行，值抄自 `apps/harness-server/tests/r9/support.ts`
// （本目录不导入产品包与测试夹具，所以抄成字面）。它们是测试值，没有度量支撑。
//
// 对照来源改了要同步这里；新行要运维层配置时，从 `serve` 的 `row-state` 里 FAILED 的 ValidationError 看出缺哪些。
import { join } from 'node:path'
import { operatorLayer as baseOperatorLayer } from '../joint-a/support.mjs'

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
  combinationVersion: 'session-composite/2',
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

/**
 * 联调 B 用的运维者层：联调 A 的一份之上，覆盖或加上模型侧、Context 侧、工具侧、Session 适配行的值。
 * `historyKinds` 给了就写进 `server-entry`（`read-history` 默认只列用户与助手消息）。
 *
 * Shell 的 `executable` 是测试值（当前 Node），不是真实命令行：工具侧 `execution-*` 还是替身时
 * 不会执行命令；换真件、要让 S4 真的执行 Shell 时，这里要改成宿主上的真实 shell。
 */
export function operatorLayerB(options) {
  const base = baseOperatorLayer(options)
  const replaced = new Map([
    [
      'session-storage',
      {
        combinationVersion: 'session-composite/2',
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
    [
      'tool-host',
      {
        construction: {
          Shell: {
            resultMaxBytes: 65536,
            executable: process.execPath,
            argsPrefix: [],
            cwd: options.storageRoot,
            env: {},
          },
          Files: { resultMaxBytes: 65536 },
        },
      },
    ],
    [
      'request-context',
      { limits: { maxTargets: 64, maxFactsPerTarget: 64, maxRevisionsPerDispatch: 16 } },
    ],
    [
      'agent-context',
      {
        owner: { ...ADOPTION, name: 'agent-context' },
        resultCapacity: { bytes: '1000000', blocks: '100', attachmentBytes: '0' },
      },
    ],
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
