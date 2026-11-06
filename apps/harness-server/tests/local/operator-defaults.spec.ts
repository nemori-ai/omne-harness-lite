// The operator layer of the local single-user profile, built over the release distribution that
// ships with the application. The process test (`setup-serve-process.spec.ts`) proves that the
// whole tree loads with it. These cases pin what the layer holds and what it never holds.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { resolveLocations } from '../../src/local/locations.ts'
import { captureShellEnvironment, isSecretName } from '../../src/local/settings.ts'
import {
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

const memberDir = fileURLToPath(new URL('../..', import.meta.url))
const distribution = JSON.parse(
  readFileSync(join(memberDir, 'config', 'serve.distribution.json'), 'utf8'),
) as { rows: { id: string; plugin: string; config?: Record<string, unknown> }[] }
const releaseRow = (id: string) => distribution.rows.find(row => row.id === id)

/** A host environment with secrets in it: none of them may reach the shell. */
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
    : { ...secrets, PATH: '/opt/tools/bin:/usr/bin:/bin', HOME: '/u', LANG: 'C.UTF-8' }
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

  it('names only the vault path for the model credential, and no secret anywhere', () => {
    expect(configOf(layer, 'model-credential')).toEqual({ path: '/h/state/model-vault.json' })
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

  it('does not overwrite any key that the release gives a replaced row', () => {
    // A key in both would let the profile change a release value without anyone noticing.
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

  it('gives the telemetry row its six budgets and leaves the implementation and the outlet to the release', () => {
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
      // Windows: the default execution policy refuses local scripts, so this process bypasses it.
      // The prelude sets UTF-8 output in this one process; it is the last argument before the script.
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
