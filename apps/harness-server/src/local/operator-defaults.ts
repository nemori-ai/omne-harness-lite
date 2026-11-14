import { z } from 'zod'
import { pathsOf, type ServerLocations } from './locations.ts'
import { isSecretName, type ServerSettings, type StorageLimits } from './settings.ts'

export const DEFAULT_READINESS_TIMEOUT_MS = 30_000
export const DEFAULT_SHUTDOWN_DEADLINE_MS = 10_000
export const DEFAULT_DRAIN_DEADLINE_MS = 120_000

export const LOCAL_HISTORY_KINDS = [
  'message.user',
  'message.assistant',
  'message.tool',
  'message.system_reminder',
  'run.started',
  'run.terminal',
] as const

export const LOCAL_DIAGNOSTICS_KINDS = [
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

export const LOCAL_DIAGNOSTICS_LIMITS = { maxRuns: 32, maxCallsPerRun: 64 } as const

const ADOPTION = {
  owner: '@omne-harness/harness-server',
  name: 'local-single-user',
  revision: '1',
  digest: '0'.repeat(64),
} as const

const PROFILES = {
  retryPolicy: { ...ADOPTION, name: 'local-single-user/retry' },
  compactionTriggerPercent: '80',
  updatedAt: '2026-11-02T00:00:00Z',
} as const

export const LOCAL_TOKENIZERS = {
  workers: 2,
  maxLeases: 256,
  maxQueuedJobs: 256,
  maxQueuedBytes: 32 * 1024 * 1024,
  maxInputBytes: 8 * 1024 * 1024,
  maxLeaseQueuedJobs: 4,
  maxCacheBytes: 16 * 1024 * 1024,
  maxCacheEntries: 65_536,
  maxLeaseCacheBytes: 256 * 1024,
  maxLeaseCacheEntries: 8_192,
  maxPieceBytes: 4_096,
  jobTimeoutMs: 10_000,
  maxWorkerOldSpaceMb: 768,
  maxReplacementsPerMinute: 2,
  cancellationGraceMs: 1_000,
} as const

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
} as const

export const LOCAL_CONCURRENT_MODEL_CALLS = 20

const TOOL_ORPHAN_GRACE_MS = 60_000

const MODEL_HOST = {
  host: {
    concurrencyLimit: LOCAL_CONCURRENT_MODEL_CALLS,
    wakeCapacity: 64,
    scanBatchSize: 10,
    scanIntervalMs: 1000,
  },
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
    maxConcurrentCalls: LOCAL_CONCURRENT_MODEL_CALLS,
    maxRedeliveries: 2,
    maxCleanupSteps: 8,
    maxPendingAccountsPerTenant: LOCAL_CONCURRENT_MODEL_CALLS,
    maxPendingAccounts: LOCAL_CONCURRENT_MODEL_CALLS,
  },
} as const

const MAX_COMMAND_BYTES = 1_048_576

function modelRecords(combinationVersion: string) {
  return {
    owners: [
      {
        consumerOwner: '@omne-harness/agent',
        evidence: { ...ADOPTION, name: 'local-single-user/agent-consumer-evidence' },
        work: { kind: 'exempt' },
      },
    ],
    limits: {
      scanPageCalls: 100,
      resultPageParts: 16,
      resultPageTargetBytes: MODEL_HOST.runtime.resultPageTargetBytes,
      readIdleMs: MODEL_HOST.runtime.readIdleMs,
      unacknowledgedResults: LOCAL_CONCURRENT_MODEL_CALLS,
    },
    requestChunkBytes: MAX_COMMAND_BYTES / 4,
    combinationVersion,
    send: { mirrorBytes: 4_194_304, maxClaims: LOCAL_CONCURRENT_MODEL_CALLS },
    diagnostics: {
      diagnosticsRead: 'tenant-self',
      retention: { ...ADOPTION, name: 'local-single-user/model-diagnostics-retention' },
    },
    // A call keeps its publication until its result body is released, so `maxRetainedCalls` must be
    // at least the calls in flight plus the unacknowledged results; a publication beyond it fails.
    observation: {
      maxSnapshotBytes: 4_194_304,
      maxDeltaBytes: 1_048_576,
      maxQueuedFrames: 256,
      maxQueuedBytes: 8_388_608,
      maxObserversPerTenant: 16,
      maxObservers: 64,
      maxPendingSourceOperations: 16,
      maxRetainedCalls: 2 * LOCAL_CONCURRENT_MODEL_CALLS,
      maxRetainedBytes: 33_554_432,
      maxTotalBytes: 67_108_864,
      maxQueueResidenceMs: 30_000,
      checkIntervalMs: 1000,
    },
    initial: { maxRecords: 1024, maxBindings: 4, maxCallsPerBinding: 1024 },
    sendStage: {
      maxRetainedAttempts: 16,
      materialization: { maxRecords: LOCAL_CONCURRENT_MODEL_CALLS },
      profiles: {
        retryPolicy: PROFILES.retryPolicy,
        compactionTriggerPercent: PROFILES.compactionTriggerPercent,
      },
      preparation: PREPARATION,
      network: { maxConnections: LOCAL_CONCURRENT_MODEL_CALLS, idleConnectionTimeoutMs: 60_000 },
      endpoints: {},
      transportLimits: {
        connectTimeoutMs: 10_000,
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
}

function storage(storageRoot: string, shutdownDeadlineMs: number, limits: StorageLimits = {}) {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    admissionWaitMs: 1000,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: MAX_COMMAND_BYTES,
    maxRequestBytes: 4_194_304,
    globalInFlightWriteBytes: 67_108_864,
    maxJsonMembers: 65_536,
    maxResponseBytes: 262_144,
    maxOperationResponseBytes: 1_048_576,
    globalWriteResponseBytes: 33_554_432,
    maxDiagnosticBytes: 4096,
    maxWorkers: limits.maxWorkers ?? 16,
    reservedWriterSlots: limits.reservedWriterSlots ?? 4,
    maxReadWorkersPerDomain: limits.maxReadWorkersPerDomain ?? 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 1000,
    maxReadInputBytes: 262_144,
    maxReadResultBytes: 20_971_520,
    globalReadResultBytes: 268_435_456,
    readObservationMs: 2000,
    readerIdleMs: 30_000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 1,
    groupMaxInputBytes: 4_194_304,
    groupMaxResponseReservationBytes: 8_388_608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 67_108_864,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16_777_216,
    walReadPauseBytes: 67_108_864,
    walWriteStopBytes: 134_217_728,
    closeDeadlineMs: storageCloseDeadlineMs(shutdownDeadlineMs),
  }
}

export function storageCloseDeadlineMs(shutdownDeadlineMs: number): number {
  return shutdownDeadlineMs - Math.min(1000, Math.floor(shutdownDeadlineMs / 2))
}

const POWERSHELL_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'] as const

export const WINDOWS_POWERSHELL_PRELUDE = [
  '$omneUtf8 = New-Object System.Text.UTF8Encoding $false',
  '[Console]::InputEncoding = $omneUtf8',
  '[Console]::OutputEncoding = $omneUtf8',
  '$OutputEncoding = $omneUtf8',
  "$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'",
  "$PSDefaultParameterValues['Select-String:Encoding'] = 'UTF8'",
  'Remove-Variable omneUtf8',
  '',
].join('; ')

const WINDOWS_POWERSHELL_ARGS = [
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  WINDOWS_POWERSHELL_PRELUDE,
] as const

export function shellArguments(platform: NodeJS.Platform, executable: string): readonly string[] {
  const name = pathsOf(platform)
    .basename(executable)
    .toLowerCase()
    .replace(/\.exe$/, '')
  if (name !== 'powershell' && name !== 'pwsh') return ['-c']
  return platform === 'win32' ? WINDOWS_POWERSHELL_ARGS : POWERSHELL_ARGS
}

export function shellEnvironment(
  platform: NodeJS.Platform,
  saved: Readonly<Record<string, string>>,
  hostFilesDir: string,
): Record<string, string> {
  const kept = Object.fromEntries(Object.entries(saved).filter(([name]) => !isSecretName(name)))
  if (platform !== 'win32') return { PATH: '/usr/bin:/bin', ...kept, TMPDIR: hostFilesDir }
  const systemRoot = kept['SystemRoot'] ?? 'C:\\Windows'
  return {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ...kept,
    TEMP: hostFilesDir,
    TMP: hostFilesDir,
  }
}

export const LOCAL_TOOL_RESULT_BYTES = 1_048_576

function toolRecords(workspace: string, combinationVersion: string) {
  return {
    filesRoot: workspace,
    combinationVersion,
    configuration: {
      authorBufferBytes: 65_536,
      authorBufferItems: 256,
      authorWaitHistoryBytes: 65_536,
      authorWaitHistoryItems: 32,
      processBatchBytes: 65_536,
      processBatchDelayMs: 0,
      observerBufferBytes: 262_144,
      resultPageBytes: 65_536,
      reconciliationDelayMs: 1000,
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
        orphanGraceMs: TOOL_ORPHAN_GRACE_MS,
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
  }
}

const AGENT_HOST = {
  observerBufferBytes: 65_536,
  reconciliationDelaysMs: [1000, 1000, 1000, 2000, 2000, 5000, 5000, 10_000, 30_000],
  reconciliationBatchLimit: 8,
  denialBackoffMs: 1000,
  toolConcurrency: 1,
  loopGuardPolicy: { ...ADOPTION, name: 'local-single-user/loop-guard' },
  modelRetry: {
    maxAttempts: 4,
    maxElapsedMs: 120_000,
    delaysMs: [1_000, 5_000, 30_000],
    jitter: 0.2,
  },
  instanceIdleMs: 60_000,
} as const

const TELEMETRY_BUDGETS = {
  maxRecordBytes: 16_384,
  maxQueueItems: 1024,
  maxQueueBytes: 4_194_304,
  maxOpenSegments: 256,
  maxLogTextLength: 4096,
  summaryIntervalMs: 10_000,
  maxSegmentLifetimeMs: 3_600_000,
} as const

const releaseSchema = z.object({
  rows: z.array(z.object({ id: z.string(), config: z.record(z.string(), z.unknown()).optional() })),
})

type ReleaseRows = ReadonlyMap<string, Readonly<Record<string, unknown>>>

function releaseRows(distribution: unknown): ReleaseRows {
  const parsed = releaseSchema.safeParse(distribution)
  if (!parsed.success) return new Map()
  return new Map(parsed.data.rows.map(row => [row.id, row.config ?? {}]))
}

export class LocalProfileError extends Error {}

function combinationVersionOf(rows: ReleaseRows): string {
  const version = rows.get('session-handoff')?.['combinationVersion']
  if (typeof version !== 'string' || version === '') {
    throw new LocalProfileError(
      'the distribution gives no combinationVersion on the session-handoff row',
    )
  }
  return version
}

export type LocalOperatorInput = Readonly<{
  distribution: unknown
  locations: Pick<ServerLocations, 'vaultFile' | 'storageRoot' | 'hostFilesDir'>
  settings: ServerSettings
  shutdownDeadlineMs: number
  platform: NodeJS.Platform
}>

export type ReplaceOperation = Readonly<{
  kind: 'replace'
  id: string
  config: Readonly<Record<string, unknown>>
}>

export type OperatorLayer = Readonly<{ ops: readonly ReplaceOperation[] }>

export function localOperatorLayer(input: LocalOperatorInput): OperatorLayer {
  const rows = releaseRows(input.distribution)
  const combinationVersion = combinationVersionOf(rows)
  const { locations, settings, platform } = input
  const path = pathsOf(platform)
  const local: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]> = [
    ['telemetry', { budgets: TELEMETRY_BUDGETS }],
    ['storage', storage(locations.storageRoot, input.shutdownDeadlineMs, settings.storage)],
    [
      'session-storage',
      {
        combinationVersion,
        directoryFile: path.join(locations.storageRoot, 'tenant-domains.json'),
        domainRule: 'organization-account/1',
      },
    ],
    ...(rows.has('secret-custody')
      ? ([['secret-custody', { path: locations.vaultFile }]] as const)
      : []),
    ['model-tokenizers', LOCAL_TOKENIZERS],
    ['model-profiles', PROFILES],
    ['model-request-preparation', PREPARATION],
    ['model-host', MODEL_HOST],
    ['model-records', modelRecords(combinationVersion)],
    [
      'tool-host',
      {
        construction: {
          Shell: {
            resultMaxBytes: LOCAL_TOOL_RESULT_BYTES,
            executable: settings.shell,
            argsPrefix: shellArguments(platform, settings.shell),
            cwd: settings.workspace,
            env: shellEnvironment(platform, settings.shellEnvironment, locations.hostFilesDir),
          },
          Files: { resultMaxBytes: LOCAL_TOOL_RESULT_BYTES, cwd: settings.workspace },
          Tools: { resultMaxBytes: 65_536, outputModalities: ['text'] },
          TodoItems: { resultMaxBytes: 1_048_576 },
          Ask: { resultMaxBytes: 1_048_576 },
          Web: { resultMaxBytes: LOCAL_TOOL_RESULT_BYTES, maxSearchResults: 10 },
        },
      },
    ],
    ['tool-records', toolRecords(settings.workspace, combinationVersion)],
    [
      'tool-body-sweep',
      {
        combinationVersion,
        ledgerCommitAttempts: 16,
        orphanGraceMs: TOOL_ORPHAN_GRACE_MS,
        intervalMs: 1000,
        limit: 100,
      },
    ],
    [
      'tool-bindings',
      {
        tools: {
          attemptMs: 250,
          resultPageBytes: 65_536,
          replyMaxBytes: 65_536,
          contentPageBytes: 16_384,
        },
        web: {
          search: {
            endpoint: 'https://api.exa.ai/search',
            type: 'lite',
            highlightChars: 1000,
            timeoutMs: 15_000,
          },
          fetch: { maxRedirects: 5, timeoutMs: 30_000, maxBodyBytes: 5 * 1024 * 1024 },
        },
      },
    ],
    ['execution-host', { filesRoot: settings.workspace, stateDirectory: locations.hostFilesDir }],
    [
      'request-context',
      { limits: { maxTargets: 64, maxFactsPerTarget: 64, maxRevisionsPerDispatch: 16 } },
    ],
    ['agent-context', {}],
    ['agent-host', AGENT_HOST],
    ['session-ad03', { scopeIndexEntries: 4096, pageBytes: 65_536 }],
    ['session-ad04', { scopeIndexEntries: 4096, pageBytes: 65_536 }],
    [
      'session-access',
      { requestJournalFile: path.join(locations.storageRoot, 'request-queue.jsonl') },
    ],
    [
      'server-entry',
      {
        listenPort: settings.port,
        historyKinds: [...LOCAL_HISTORY_KINDS],
        diagnosticsKinds: [...LOCAL_DIAGNOSTICS_KINDS],
        ...LOCAL_DIAGNOSTICS_LIMITS,
      },
    ],
  ]
  return {
    ops: local.map(([id, config]) => ({
      kind: 'replace',
      id,
      config: { ...rows.get(id), ...config },
    })),
  }
}
