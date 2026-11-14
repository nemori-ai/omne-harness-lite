import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CHECKPOINT_STATE_MAX_BYTES,
  WAIT_REQUEST_MAX_BYTES,
  WAIT_RESPONSE_MAX_BYTES,
} from '@omne-harness/tool-contract/provider'
import { resolveLocations } from '../../src/local/locations.ts'
import { captureShellEnvironment, isSecretName } from '../../src/local/settings.ts'
import {
  LOCAL_CONCURRENT_MODEL_CALLS,
  LOCAL_DIAGNOSTICS_KINDS,
  LOCAL_DIAGNOSTICS_LIMITS,
  LOCAL_HISTORY_KINDS,
  WINDOWS_POWERSHELL_PRELUDE,
  LocalProfileError,
  localOperatorLayer,
  shellArguments,
  storageCloseDeadlineMs,
  type LocalOperatorInput,
} from '../../src/local/operator-defaults.ts'
import { sessionAccessConfig } from '../../src/rows/session-access/index.ts'
import { toolRowsOperatorConfig } from '../r9/support.ts'

const memberDir = fileURLToPath(new URL('../..', import.meta.url))
const distribution = JSON.parse(
  readFileSync(join(memberDir, 'config', 'serve.distribution.json'), 'utf8'),
) as { rows: { id: string; plugin: string; config?: Record<string, unknown> }[] }
const releaseRow = (id: string) => distribution.rows.find(row => row.id === id)

function hostEnvironment(platform: NodeJS.Platform): Record<string, string> {
  const secrets = {
    OPENROUTER_API_KEY: 'sk-or-must-not-leak',
    GH_TOKEN: 'ghp-must-not-leak',
    AWS_SECRET_ACCESS_KEY: 'aws-must-not-leak',
    DB_PASSWORD: 'pw-must-not-leak',
    NPM_CONFIG_USERCONFIG: 'not-in-the-allowlist',
  }
  return platform === 'win32'
    ? { ...secrets, Path: 'C:\\Tools;C:\\Windows', SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\u' }
    : {
        ...secrets,
        PATH: '/opt/tools/bin:/usr/bin:/bin',
        HOME: '/u',
        LANG: 'C.UTF-8',
        XDG_RUNTIME_DIR: '/run/user/1000',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      }
}

function input(platform: NodeJS.Platform): LocalOperatorInput {
  const env = platform === 'win32' ? { OMNE_SERVER_HOME: 'C:\\h' } : { OMNE_SERVER_HOME: '/h' }
  const located = resolveLocations({ platform, env, home: platform === 'win32' ? 'C:\\u' : '/u' })
  if (located.kind !== 'located') throw new Error('fixture')
  return {
    distribution,
    locations: located.locations,
    settings: {
      version: 1,
      port: 8965,
      workspace: platform === 'win32' ? 'C:\\work' : '/work',
      shell: platform === 'win32' ? 'C:\\Windows\\System32\\pwsh.exe' : '/bin/bash',
      shellEnvironment: captureShellEnvironment(platform, hostEnvironment(platform)),
    },
    shutdownDeadlineMs: 10_000,
    platform,
  }
}

const configOf = (layer: ReturnType<typeof localOperatorLayer>, id: string) =>
  layer.ops.find(op => op.id === id)?.config

describe('localOperatorLayer over the bundled distribution', () => {
  const layer = localOperatorLayer(input('linux'))

  it('replaces only rows that the release has, and none that is a stub', () => {
    for (const op of layer.ops) {
      expect(op.kind).toBe('replace')
      expect(releaseRow(op.id)?.plugin, op.id).toBeDefined()
      expect(releaseRow(op.id)?.plugin, op.id).not.toBe('stubPlugin')
    }
  })

  it('bounds the arguments of a tool call so that an admission fits one storage command', () => {
    const limits = z.object({
      preparation: z.object({
        openai: z.object({
          limits: z.object({ toolArguments: z.object({ maxBytes: z.number() }) }),
        }),
      }),
      storage: z.object({ maxCommandBytes: z.number() }),
    })
    const configOf = (id: string) => layer.ops.find(item => item.id === id)?.config
    const { preparation, storage } = limits.parse({
      preparation: configOf('model-request-preparation'),
      storage: configOf('storage'),
    })
    const argumentBytes = preparation.openai.limits.toolArguments.maxBytes
    const commandBytes = storage.maxCommandBytes
    expect(argumentBytes * 12).toBeLessThan(commandBytes)
  })

  it('bounds the suspension content of a tool call so that each of its commits fits one storage command', () => {
    const config = layer.ops.find(item => item.id === 'storage')?.config
    const commandBytes = z.object({ maxCommandBytes: z.number() }).parse(config).maxCommandBytes
    expect(WAIT_REQUEST_MAX_BYTES * 2).toBeLessThanOrEqual(commandBytes / 2)
    expect(Math.ceil(CHECKPOINT_STATE_MAX_BYTES / 3) * 4).toBeLessThanOrEqual(commandBytes / 2)
    expect(WAIT_RESPONSE_MAX_BYTES).toBeLessThanOrEqual(commandBytes / 2)
  })

  it('names only the vault path for the secret custody, and no secret anywhere', () => {
    expect(configOf(layer, 'model-credential')).toBeUndefined()
    expect(configOf(layer, 'secret-custody')).toEqual({ path: '/h/state/model-vault.json' })
    expect(configOf(layer, 'settings')).toBeUndefined()
    expect(JSON.stringify(layer)).not.toMatch(/factorySecret|must-not-leak/)
  })

  it('keeps the values the release owns: maxJsonDepth, jointCommits, coordination', () => {
    expect(configOf(layer, 'storage')).toMatchObject({
      maxJsonDepth: releaseRow('storage')?.config?.['maxJsonDepth'],
      storageRoot: '/h/state/storage',
    })
    expect(configOf(layer, 'agent-host')).toMatchObject({
      jointCommits: releaseRow('agent-host')?.config?.['jointCommits'],
      coordination: releaseRow('agent-host')?.config?.['coordination'],
    })
  })

  it('gives the Agent the retry budget of a failed main model call', () => {
    expect(configOf(layer, 'agent-host')).toMatchObject({
      modelRetry: {
        maxAttempts: 4,
        maxElapsedMs: 120_000,
        delaysMs: [1_000, 5_000, 30_000],
        jitter: 0.2,
      },
    })
  })

  describe('the storage thread limits of the settings', () => {
    const threadLimits = (config: Record<string, unknown> | undefined) => ({
      maxWorkers: config?.['maxWorkers'],
      reservedWriterSlots: config?.['reservedWriterSlots'],
      maxReadWorkersPerDomain: config?.['maxReadWorkersPerDomain'],
    })
    const withStorage = (storage?: Record<string, number>) => {
      const base = input('linux')
      return localOperatorLayer({
        ...base,
        settings: { ...base.settings, ...(storage === undefined ? {} : { storage }) },
      })
    }

    it('are 16, 4 and 2 when the settings give no storage object', () => {
      expect(threadLimits(configOf(withStorage(), 'storage'))).toEqual({
        maxWorkers: 16,
        reservedWriterSlots: 4,
        maxReadWorkersPerDomain: 2,
      })
    })

    it('take the value of each key that the settings give, and keep the default of the others', () => {
      expect(threadLimits(configOf(withStorage({ maxWorkers: 32 }), 'storage'))).toEqual({
        maxWorkers: 32,
        reservedWriterSlots: 4,
        maxReadWorkersPerDomain: 2,
      })
      expect(
        threadLimits(
          configOf(
            withStorage({ maxWorkers: 8, reservedWriterSlots: 0, maxReadWorkersPerDomain: 3 }),
            'storage',
          ),
        ),
      ).toEqual({ maxWorkers: 8, reservedWriterSlots: 0, maxReadWorkersPerDomain: 3 })
    })
  })

  it('admits LOCAL_CONCURRENT_MODEL_CALLS model calls of one tenant at once on every bound', () => {
    const calls = LOCAL_CONCURRENT_MODEL_CALLS
    expect(calls).toBe(20)
    const records = z
      .object({
        limits: z.object({ unacknowledgedResults: z.number() }),
        send: z.object({ maxClaims: z.number() }),
        sendStage: z.object({
          materialization: z.object({ maxRecords: z.number() }),
          network: z.object({ maxConnections: z.number() }),
        }),
      })
      .parse(configOf(layer, 'model-records'))
    expect(records.limits.unacknowledgedResults).toBe(calls)
    expect(records.send.maxClaims).toBe(calls)
    expect(records.sendStage.materialization.maxRecords).toBe(calls)
    expect(records.sendStage.network.maxConnections).toBe(calls)
    expect(configOf(layer, 'model-host')).toMatchObject({
      host: { concurrencyLimit: calls },
      results: {
        maxConcurrentCalls: calls,
        maxPendingAccountsPerTenant: calls,
        maxPendingAccounts: calls,
      },
    })
  })

  it('does not overwrite any key that the release gives a replaced row', () => {
    const profileOnly = localOperatorLayer({
      ...input('linux'),
      distribution: { rows: [{ id: 'session-handoff', config: { combinationVersion: 'v' } }] },
    })
    for (const op of profileOnly.ops) {
      const release = Object.keys(releaseRow(op.id)?.config ?? {})
      const own = Object.keys(op.config)
      expect(
        own.filter(key => release.includes(key)),
        op.id,
      ).toEqual([])
    }
  })

  it('takes the combination version of session-handoff for the three rows that need it', () => {
    const version = releaseRow('session-handoff')?.config?.['combinationVersion']
    for (const id of ['session-storage', 'model-records', 'tool-records'])
      expect(configOf(layer, id)?.['combinationVersion'], id).toBe(version)
  })

  it('puts the request journal of session-access in the storage root, beside the release values', () => {
    expect(configOf(layer, 'session-access')).toEqual({
      ...releaseRow('session-access')?.config,
      requestJournalFile: `${input('linux').locations.storageRoot}/request-queue.jsonl`,
    })
    expect(sessionAccessConfig.safeParse(configOf(layer, 'session-access')).success).toBe(true)
  })

  it('lists the Run frame and the tool messages in the history and uses the settings port', () => {
    expect(configOf(layer, 'server-entry')).toEqual({
      listenPort: 8965,
      historyKinds: [...LOCAL_HISTORY_KINDS],
      diagnosticsKinds: [...LOCAL_DIAGNOSTICS_KINDS],
      ...LOCAL_DIAGNOSTICS_LIMITS,
    })
    expect(LOCAL_HISTORY_KINDS).toEqual(
      expect.arrayContaining([
        'run.started',
        'run.terminal',
        'message.tool',
        'message.system_reminder',
      ]),
    )
  })

  const resultBounds = z.record(z.string(), z.object({ resultMaxBytes: z.number() }))
  const localBounds = () =>
    resultBounds.parse(
      z.object({ construction: z.unknown() }).parse(configOf(layer, 'tool-host')).construction,
    )

  it('bounds every tool result above the inline threshold, and the Tools reply within it', () => {
    const inline = z
      .object({
        configuration: z.object({ offloading: z.object({ maxInlineUtf8Bytes: z.number() }) }),
      })
      .parse(configOf(layer, 'tool-records')).configuration.offloading.maxInlineUtf8Bytes
    const bounds = localBounds()
    expect(Object.keys(bounds).sort()).toEqual([
      'Ask',
      'Files',
      'Shell',
      'TodoItems',
      'Tools',
      'Web',
    ])
    for (const tool of ['Shell', 'Files', 'Web', 'TodoItems', 'Ask'])
      expect(bounds[tool]?.resultMaxBytes, tool).toBeGreaterThan(inline)
    expect(bounds['Tools']?.resultMaxBytes).toBeLessThanOrEqual(inline)
  })

  it('gives the test operator layer the tool result bounds of the local profile', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'omne-result-bounds-')))
    try {
      const { construction } = toolRowsOperatorConfig({ storageRoot: join(base, 'storage') })
      const tests = resultBounds.parse(construction)
      for (const [tool, bound] of Object.entries(localBounds()))
        expect(tests[tool]?.resultMaxBytes, tool).toBe(bound.resultMaxBytes)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('puts the workspace under both tools and the execution host', () => {
    expect(configOf(layer, 'tool-host')).toMatchObject({
      construction: {
        Shell: { executable: '/bin/bash', argsPrefix: ['-c'], cwd: '/work' },
        Files: { cwd: '/work' },
      },
    })
    expect(configOf(layer, 'tool-records')).toMatchObject({ filesRoot: '/work' })
    expect(configOf(layer, 'execution-host')).toEqual({
      filesRoot: '/work',
      stateDirectory: '/h/state/host-files',
    })
  })

  it('gives the telemetry row its seven budgets and leaves the implementation and the outlet to the release', () => {
    const telemetry = configOf(layer, 'telemetry')
    expect(telemetry).toMatchObject({ implementation: 'node', outlet: { kind: 'stdout' } })
    const budgets = z
      .object({
        maxRecordBytes: z.number().int().positive(),
        maxQueueItems: z.number().int().positive(),
        maxQueueBytes: z.number().int().positive(),
        maxOpenSegments: z.number().int().positive(),
        maxLogTextLength: z.number().int().positive(),
        summaryIntervalMs: z.number().int().positive(),
        maxSegmentLifetimeMs: z.number().int().positive(),
      })
      .strict()
      .safeParse(telemetry?.['budgets'])
    expect(budgets.success, JSON.stringify(budgets)).toBe(true)
    expect(Object.keys(telemetry ?? {}).sort()).toEqual(['budgets', 'implementation', 'outlet'])
  })

  const toolHost = z.object({
    construction: z.object({ Shell: z.object({ env: z.record(z.string(), z.string()) }) }),
  })
  const shellEnv = (l: ReturnType<typeof localOperatorLayer>) =>
    toolHost.parse(configOf(l, 'tool-host')).construction.Shell.env

  it('gives the shell the saved allowlist, PATH included, and its own temp directory', () => {
    expect(shellEnv(layer)).toEqual({
      PATH: '/opt/tools/bin:/usr/bin:/bin',
      HOME: '/u',
      LANG: 'C.UTF-8',
      XDG_RUNTIME_DIR: '/run/user/1000',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      TMPDIR: '/h/state/host-files',
    })
    expect(shellEnv(localOperatorLayer(input('win32')))).toEqual({
      PATH: 'C:\\Tools;C:\\Windows',
      SystemRoot: 'C:\\Windows',
      WINDIR: 'C:\\Windows',
      USERPROFILE: 'C:\\u',
      TEMP: 'C:\\h\\state\\host-files',
      TMP: 'C:\\h\\state\\host-files',
    })
  })

  it('no variable of the host that looks like a secret reaches the shell', () => {
    for (const platform of ['linux', 'win32'] as const) {
      const env = shellEnv(localOperatorLayer(input(platform)))
      expect(Object.keys(env).filter(isSecretName), platform).toEqual([])
      expect(JSON.stringify(env), platform).not.toMatch(/must-not-leak|not-in-the-allowlist/)
    }
  })

  it('drops a secret-like name even from settings that bypassed the schema', () => {
    const planted = input('linux')
    const layered = localOperatorLayer({
      ...planted,
      settings: {
        ...planted.settings,
        shellEnvironment: { ...planted.settings.shellEnvironment, OPENROUTER_API_KEY: 'x' },
      },
    })
    expect(shellEnv(layered)).not.toHaveProperty('OPENROUTER_API_KEY')
  })

  it('negative control: a distribution without session-handoff cannot be served by the profile', () => {
    expect(() => localOperatorLayer({ ...input('linux'), distribution: { rows: [] } })).toThrow(
      LocalProfileError,
    )
  })
})

describe('shellArguments', () => {
  it.each([
    ['win32', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'ps'],
    ['win32', 'C:\\Program Files\\PowerShell\\7\\PWSH.EXE', 'ps'],
    ['linux', '/usr/bin/pwsh', 'ps-posix'],
    ['linux', '/bin/bash', 'posix'],
    ['linux', '/bin/sh', 'posix'],
  ] as const)('%s %s takes the %s arguments', (platform, executable, kind) => {
    const expected = {
      ps: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        WINDOWS_POWERSHELL_PRELUDE,
      ],
      'ps-posix': ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
      posix: ['-c'],
    }[kind]
    expect(shellArguments(platform, executable)).toEqual(expected)
  })
})

describe('storageCloseDeadlineMs', () => {
  it.each([
    [10_000, 9000],
    [2000, 1000],
    [1500, 750],
    [1, 1],
  ])('D = %i gives %i, never above D', (deadline, close) => {
    expect(storageCloseDeadlineMs(deadline)).toBe(close)
    expect(storageCloseDeadlineMs(deadline)).toBeLessThanOrEqual(deadline)
  })
})
