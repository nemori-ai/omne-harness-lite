// The operator layer of the "local single-user" profile: one person runs the server on own host,
// with own model credential, one workspace and the host shell. `serve` without `--operator` builds
// this layer at start. The release layer writes no numeric defaults (R2-D6), so the numbers of
// this profile live here, in code, and not in the settings file.
//
// Sources of the values: the operator layer of joint B (`tools/joint-b/operator.mjs`) and of the
// coding agent tutorial, which ran a real model with 15 tool calls on the WIRE head `1a34bcba6`.
// Where the two differ, the tutorial value is taken: Shell and Files results at 32768 bytes, Files
// with a working directory (R2-D295), and a `tool-records` reconciliation delay of 1000 ms.
// No measurement backs these numbers, and the adoption references are placeholders with a zero
// digest. SPEC.md lists this as a known limitation.
//
// A `replace` swaps the whole row configuration. So every row here starts from the configuration
// that the release layer gives the row, and the profile adds its own keys over it. Values the
// release owns (`storage.maxJsonDepth`, `agent-host.jointCommits` and `coordination`, and the
// combination version of `session-handoff`) therefore come from the distribution, not from here.
import { z } from 'zod'
import { pathsOf, type ServerLocations } from './locations.ts'
import { isSecretName, type ServerSettings } from './settings.ts'

/** `serve` waits this long for every enabled row to become ACTIVE when no flag says otherwise. */
export const DEFAULT_READINESS_TIMEOUT_MS = 30_000
/** The shutdown deadline D of `serve` when no flag says otherwise. */
export const DEFAULT_SHUTDOWN_DEADLINE_MS = 10_000

/** The history kinds `read-history` lists: the conversation, the tool messages and the Run frame. */
export const LOCAL_HISTORY_KINDS = [
  'message.user',
  'message.assistant',
  'message.tool',
  'message.system_reminder',
  'run.started',
  'run.terminal',
] as const

/**
 * The entry kinds `read-session-diagnostics` reads: every kind the projection knows
 * (server-entry `PROJECTED_KINDS`, RFC-0013「数据来源与读取路径」), so the diagnostics of one
 * person's host hide nothing from that person (DA4, adopted for now). A kind left out here is a
 * `not-disclosed` gap of every read.
 */
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

/**
 * The bounds of one diagnostics page: the most Runs, and the most calls of one Run that enter the
 * fan-out to Model and Tool. Initial values, not measured: a page of one person's session.
 */
export const LOCAL_DIAGNOSTICS_LIMITS = { maxRuns: 32, maxCallsPerRun: 64 } as const

/** The adoption that the placeholder references of this profile name. */
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
  cancellationGraceMs: 25,
} as const

const PREPARATION = {
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
    margin: { percent: '10', source: ADOPTION },
  },
} as const

/**
 * How many model calls of the one tenant may be in flight at once. The tenant's share in
 * `model-records` is this many result capacities of one call, and every bound on the way of a call
 * (host drives, result pushes, send claims, materialized transports, connections) admits as many.
 */
export const LOCAL_CONCURRENT_MODEL_CALLS = 20

/** The result capacity of one call; at most `maxCallBytes` of model-records (N1). */
const CALL_RESULT_CAPACITY = { bytes: 524_288, blocks: 100, attachmentBytes: 0 } as const

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

/** `count` result capacities of one call, in the decimal text of the row configurations. */
function capacityText(call: typeof CALL_RESULT_CAPACITY, count: number) {
  return {
    bytes: String(call.bytes * count),
    blocks: String(call.blocks * count),
    attachmentBytes: String(call.attachmentBytes * count),
  }
}

/** The OpenRouter route of the model send stage. */
export const OPENROUTER_ROUTE = 'https://openrouter.ai/api/v1/chat/completions'

/** The storage provider's command bound. `model-records` and `tool-records` use the same value. */
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
      capacity: capacityText(CALL_RESULT_CAPACITY, LOCAL_CONCURRENT_MODEL_CALLS),
    },
    maxCallBytes: CALL_RESULT_CAPACITY.bytes,
    maxCommandBytes: MAX_COMMAND_BYTES,
    combinationVersion,
    send: { mirrorBytes: 4_194_304, maxClaims: LOCAL_CONCURRENT_MODEL_CALLS },
    // The read face `modelDiagnostics`: a tenant reads its own calls; the retention is a placeholder adoption.
    diagnostics: {
      diagnosticsRead: 'tenant-self',
      retention: { ...ADOPTION, name: 'local-single-user/model-diagnostics-retention' },
    },
    initial: { maxRecords: 1024, maxBindings: 4, maxCallsPerBinding: 1024 },
    sendStage: {
      maxRetainedAttempts: 16,
      materialization: { maxRecords: LOCAL_CONCURRENT_MODEL_CALLS },
      factoryQueryId: 'factory-openrouter',
      profiles: {
        retryPolicy: PROFILES.retryPolicy,
        compactionTriggerPercent: PROFILES.compactionTriggerPercent,
      },
      preparation: PREPARATION,
      network: { maxConnections: LOCAL_CONCURRENT_MODEL_CALLS, idleConnectionTimeoutMs: 60_000 },
      routes: { openrouter: { url: OPENROUTER_ROUTE, endMarker: '[DONE]' } },
      transportLimits: {
        connectTimeoutMs: 10_000,
        // Retries only a failure before the request bytes left: 2 retries after 500 ms and 1000 ms.
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

/**
 * The storage provider of the local host. `closeDeadlineMs` stays below the shutdown deadline D,
 * because the storage handle answers at D (SPEC.md, ordered shutdown, step 6).
 */
function storage(storageRoot: string, shutdownDeadlineMs: number) {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
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
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
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

/** One second below D, but never less than half of D. */
export function storageCloseDeadlineMs(shutdownDeadlineMs: number): number {
  return shutdownDeadlineMs - Math.min(1000, Math.floor(shutdownDeadlineMs / 2))
}

const POWERSHELL_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'] as const

/**
 * A script that `-Command` runs before the script of the call. On Windows, a PowerShell whose
 * output goes to a pipe writes in the OEM code page of the console (936 on a Chinese system), and
 * reads the input of `[Console]::In` and decodes the output of native programs in the same page, while `$OutputEncoding` (the page of text
 * that goes to a native program) is ASCII. The host decodes the output as UTF-8, so Chinese text
 * turns to noise. This prelude sets the encodings of this one process to UTF-8 without a
 * byte order mark. `[Console]::OutputEncoding` also sets the page of the console, which native
 * programs inherit, so
 * - the output of PowerShell itself and the output of native programs (`cmd /c echo`, `git log`)
 *   reach the host as UTF-8, and a string piped to a native program goes out as UTF-8;
 * - `[Console]::In` reads the standard input of a call, which the host sends as UTF-8, as UTF-8;
 * - `Get-Content` and `Select-String` read a file without a byte order mark as UTF-8 and not as the
 *   ANSI page. A call that names another `-Encoding` still wins.
 * The encodings belong to the process: no machine or user setting changes. The prelude ends with
 * a semicolon, because PowerShell joins the arguments after `-Command` with spaces, so the script of
 * the call follows it as the rest of the command.
 *
 * Known limit: `Set-Content`, `Out-File` and `>` still write in the default encoding of the
 * PowerShell, which is the ANSI page in Windows PowerShell 5.1. A byte order mark would break
 * files such as `package.json`, so the profile does not force one.
 */
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

/**
 * Windows PowerShell refuses local scripts under its default execution policy. `Bypass` applies to
 * this one process only and changes no policy of the host.
 */
const WINDOWS_POWERSHELL_ARGS = [
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  WINDOWS_POWERSHELL_PRELUDE,
] as const

/**
 * The arguments that put a script after the executable. PowerShell (`powershell`, `pwsh`) takes
 * `-Command`, on Windows with `-ExecutionPolicy Bypass` and the UTF-8 prelude, which is the last
 * argument before the script. Any other executable is taken as a POSIX shell that takes `-c`.
 */
export function shellArguments(platform: NodeJS.Platform, executable: string): readonly string[] {
  const name = pathsOf(platform)
    .basename(executable)
    .toLowerCase()
    .replace(/\.exe$/, '')
  if (name !== 'powershell' && name !== 'pwsh') return ['-c']
  return platform === 'win32' ? WINDOWS_POWERSHELL_ARGS : POWERSHELL_ARGS
}

/**
 * The environment of the shell process: the allowlist values that `setup` saved, and the temp
 * directory, which is the host files directory that the server owns. Nothing else of the server
 * environment reaches the shell. A name that looks like a secret is dropped here too, so a layer
 * built from settings that bypassed the schema still holds none.
 */
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

const TOOL_RESULT_BYTES = 32_768

function toolRecords(workspace: string, combinationVersion: string) {
  return {
    filesRoot: workspace,
    combinationVersion,
    maxCommandBytes: MAX_COMMAND_BYTES,
    maxChunkBytes: 16_384,
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
    },
    capacity: 64,
    observersPerCall: 4,
    observerQueueFrames: 16,
    observerResidenceMs: 5000,
  }
}

/**
 * The factory numbers of `agent-host`. The reconciliation delay and the denial backoff are 1000 ms:
 * an Agent that waits for a dependency checks again at this interval, and 0 runs it again about
 * every 9 ms (R2-D209). `loopGuardPolicy` has no production adoption source yet (L-RUN wave 3).
 */
const AGENT_HOST = {
  observerBufferBytes: 65_536,
  reconciliationDelayMs: 1000,
  reconciliationBatchLimit: 8,
  denialBackoffMs: 1000,
  toolConcurrency: 1,
  loopGuardPolicy: { ...ADOPTION, name: 'local-single-user/loop-guard' },
  instanceIdleMs: 60_000,
} as const

/**
 * The budgets of the `telemetry` row (the implementation and the outlet are release values). Like
 * every number of this profile they are unmeasured initial values: a few hundred records in flight
 * cover the diagnostics of one person's host, and the summary line on stderr is at most one in ten
 * seconds. `maxSegmentLifetimeMs` is one hour, the provider's default (`DEFAULT_SEGMENT_LIFETIME_MS`
 * of `@omne-harness/telemetry-node`, proposed by the closure tel-r4-node of card #1140); RFC-0013
 * names the budget without a number. It is written here so that the profile states every number
 * it runs with.
 */
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

/** Why the profile cannot build a layer for the given distribution. */
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
  /** The parsed distribution. Its row configurations are the base of each replaced row. */
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

/**
 * Builds the operator layer of the local single-user profile. The model credential row names only
 * the vault path: the secret is in the vault that `setup` built, never in this layer.
 */
export function localOperatorLayer(input: LocalOperatorInput): OperatorLayer {
  const rows = releaseRows(input.distribution)
  const combinationVersion = combinationVersionOf(rows)
  const { locations, settings, platform } = input
  const path = pathsOf(platform)
  const local: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]> = [
    ['telemetry', { budgets: TELEMETRY_BUDGETS }],
    ['storage', storage(locations.storageRoot, input.shutdownDeadlineMs)],
    [
      'session-storage',
      {
        combinationVersion,
        directoryFile: path.join(locations.storageRoot, 'tenant-domains.json'),
        domainRule: 'organization-account/1',
      },
    ],
    ['model-credential', { path: locations.vaultFile }],
    // The secret custody row opens the same vault file. The release lists the row only once the
    // trusted table and the distribution carry it; until then the layer leaves it out.
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
            resultMaxBytes: TOOL_RESULT_BYTES,
            executable: settings.shell,
            argsPrefix: shellArguments(platform, settings.shell),
            cwd: settings.workspace,
            env: shellEnvironment(platform, settings.shellEnvironment, locations.hostFilesDir),
          },
          // Files resolves a relative path against its own working directory (R2-D295).
          Files: { resultMaxBytes: TOOL_RESULT_BYTES, cwd: settings.workspace },
          Tools: { resultMaxBytes: 65_536, outputModalities: ['text'] },
          TodoItems: { resultMaxBytes: 1_048_576 },
        },
      },
    ],
    ['tool-records', toolRecords(settings.workspace, combinationVersion)],
    [
      'tool-bindings',
      {
        tools: {
          attemptMs: 250,
          resultPageBytes: 65_536,
          replyMaxBytes: 65_536,
          contentPageBytes: 4096,
        },
      },
    ],
    ['execution-host', { filesRoot: settings.workspace, stateDirectory: locations.hostFilesDir }],
    [
      'request-context',
      { limits: { maxTargets: 64, maxFactsPerTarget: 64, maxRevisionsPerDispatch: 16 } },
    ],
    ['agent-context', { resultCapacity: capacityText(CALL_RESULT_CAPACITY, 1) }],
    ['agent-host', AGENT_HOST],
    ['session-ad03', { scopeIndexEntries: 4096, pageBytes: 65_536 }],
    ['session-ad04', { scopeIndexEntries: 4096, pageBytes: 65_536 }],
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
