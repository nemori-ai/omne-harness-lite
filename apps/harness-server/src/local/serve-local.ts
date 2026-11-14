import { mkdirSync, realpathSync, statSync } from 'node:fs'
import { openSecretVault } from '@omne-harness/settings-local/secrets'
import { LocalProfileError, localOperatorLayer, type OperatorLayer } from './operator-defaults.ts'
import { resolveLocations, type LocationInput } from './locations.ts'
import { readSettings, type ServerSettings } from './settings.ts'

export type LocalServeInput = LocationInput &
  Readonly<{
    needOperator: boolean
    needStateRoot: boolean
    distribution: unknown
    shutdownDeadlineMs: number
  }>

export type LocalServe =
  | Readonly<{
      kind: 'ready'
      operator?: OperatorLayer
      stateRoot?: string
      settings?: ServerSettings
    }>
  | Readonly<{ kind: 'not-set-up'; detail: string }>
  | Readonly<{ kind: 'refused'; message: string }>

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function realWorkspace(path: string): string | undefined {
  if (!isDirectory(path)) return undefined
  try {
    return realpathSync.native(path)
  } catch {
    return undefined
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function vaultProblem(path: string): LocalServe | undefined {
  const opened = openSecretVault({ path })
  if (opened.kind === 'open') {
    opened.vault.close()
    return undefined
  }
  if (opened.cause === 'missing')
    return { kind: 'not-set-up', detail: `no model credential vault at ${path}` }
  const fix = isFile(path)
    ? 'Run `harness-server setup --replace-credential` to build a new vault with a new credential.'
    : 'It is not a file. Remove it, then run `harness-server setup`.'
  return {
    kind: 'refused',
    message: `the model credential vault ${path} cannot be read (${opened.cause})\n${fix}`,
  }
}

export function localServeInputs(input: LocalServeInput): LocalServe {
  if (!input.needOperator && !input.needStateRoot) return { kind: 'ready' }
  const located = resolveLocations(input)
  if (located.kind === 'refused') return { kind: 'refused', message: located.message }
  const { locations } = located
  if (input.needStateRoot && !isDirectory(locations.stateDir))
    return { kind: 'not-set-up', detail: `no state directory at ${locations.stateDir}` }
  const stateRoot = input.needStateRoot ? { stateRoot: locations.stateDir } : {}
  if (!input.needOperator) return { kind: 'ready', ...stateRoot }

  const read = readSettings(locations.settingsFile)
  if (read.kind === 'missing')
    return { kind: 'not-set-up', detail: `no settings at ${locations.settingsFile}` }
  if (read.kind === 'invalid')
    return {
      kind: 'refused',
      message:
        `the settings at ${locations.settingsFile} are not valid: ${read.reason}\n` +
        'Edit the file to fix it. `harness-server setup --reset` replaces it with default values.',
    }
  const { settings } = read
  const vault = vaultProblem(locations.vaultFile)
  if (vault !== undefined) return vault
  const workspace = realWorkspace(settings.workspace)
  if (workspace === undefined)
    return {
      kind: 'refused',
      message:
        `the workspace ${settings.workspace} is not a directory\n` +
        'Create it, or run `harness-server setup --reconfigure --workspace <dir>`.',
    }
  try {
    mkdirSync(locations.hostFilesDir, { recursive: true, mode: 0o700 })
    const operator = localOperatorLayer({
      distribution: input.distribution,
      locations,
      settings: { ...settings, workspace },
      shutdownDeadlineMs: input.shutdownDeadlineMs,
      platform: input.platform,
    })
    return { kind: 'ready', operator, settings, ...stateRoot }
  } catch (error: unknown) {
    if (error instanceof LocalProfileError) return { kind: 'refused', message: error.message }
    return { kind: 'refused', message: `cannot prepare ${locations.hostFilesDir}` }
  }
}
