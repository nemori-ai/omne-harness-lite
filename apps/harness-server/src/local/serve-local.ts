// What `serve` takes from the local single-user setup when a flag is absent. Without `--operator`
// it builds the operator layer of the profile from the settings file and the release distribution.
// Without `--state-root` it uses the state directory. A host without `setup` gets one clear
// sentence and the next command, not a failed row.
import { mkdirSync, realpathSync, statSync } from 'node:fs'
import { openLocalCustodian } from '@omne-harness/model-host-local'
import { LocalProfileError, localOperatorLayer, type OperatorLayer } from './operator-defaults.ts'
import { resolveLocations, type LocationInput } from './locations.ts'
import { readSettings, type ServerSettings } from './settings.ts'

export type LocalServeInput = LocationInput &
  Readonly<{
    /** No `--operator`: build the profile layer. */
    needOperator: boolean
    /** No `--state-root`: use the state directory. */
    needStateRoot: boolean
    distribution: unknown
    shutdownDeadlineMs: number
  }>

export type LocalServe =
  | Readonly<{
      kind: 'ready'
      operator?: OperatorLayer
      stateRoot?: string
      /** The settings the layer came from, when it was built. */
      settings?: ServerSettings
    }>
  /** The host has no complete setup. `detail` names what is missing. */
  | Readonly<{ kind: 'not-set-up'; detail: string }>
  /** The setup is there but cannot be used as it is. */
  | Readonly<{ kind: 'refused'; message: string }>

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * The real path of the workspace, the root that the Files and Shell rows get (R2-D376). A workspace
 * named through a link or by its 8.3 short name is served at the directory that it names. It is
 * taken once, here; the settings file keeps what `setup` wrote.
 */
function realWorkspace(path: string): string | undefined {
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

/**
 * The vault is opened, not only found: a file that cannot be read would let every row load and
 * fail the first model call. A missing vault means "not set up"; an unreadable one is refused.
 */
function vaultProblem(path: string): LocalServe | undefined {
  const opened = openLocalCustodian({ path })
  if (opened.kind === 'open') {
    opened.custodian.close()
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
  const workspace = isDirectory(settings.workspace) ? realWorkspace(settings.workspace) : undefined
  if (workspace === undefined)
    return {
      kind: 'refused',
      message:
        `the workspace ${settings.workspace} is not a directory\n` +
        'Create it, or run `harness-server setup --reconfigure --workspace <dir>`.',
    }
  try {
    // The host files directory belongs to the server. It is made again when it is gone.
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
