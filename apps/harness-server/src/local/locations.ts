// Where the local single-user server keeps its configuration and its state on one host. `setup`
// writes these places and `serve` without arguments reads them. The rule is a pure function of the
// platform, the environment and the user directory, so a test can run the Linux rule on Windows.
//
// - `OMNE_SERVER_HOME=<abs dir>` moves the whole set: `<dir>/config` and `<dir>/state`.
// - Windows: `%LOCALAPPDATA%\omne\config` and `%LOCALAPPDATA%\omne\state`.
// - Other platforms (XDG): `$XDG_CONFIG_HOME/omne` (default `~/.config/omne`) and
//   `$XDG_STATE_HOME/omne` (default `~/.local/state/omne`). A relative XDG value is ignored, as the
//   XDG base directory rule says.
import { posix, win32 } from 'node:path'

export const SERVER_HOME_ENV = 'OMNE_SERVER_HOME'

/** The file of the local server settings, in the configuration directory. */
export const SETTINGS_FILE = 'server.json'

export type LocationInput = Readonly<{
  platform: NodeJS.Platform
  env: Readonly<Record<string, string | undefined>>
  /** The user directory (`os.homedir()`). */
  home: string
}>

export type ServerLocations = Readonly<{
  /** Which rule chose the places. */
  source: 'override' | 'platform'
  configDir: string
  stateDir: string
  /** `<config>/server.json`: port, workspace, shell. No secret. */
  settingsFile: string
  /** `<state>/model-vault.json`: the model credential vault. The only file that holds a secret. */
  vaultFile: string
  /** `<state>/storage`: the storage root of the `storage` row. `serve` creates it. */
  storageRoot: string
  /** `<state>/host-files`: the state directory of the execution host and the shell temp files. */
  hostFilesDir: string
  /** `<state>/workspace`: the workspace when `setup` is not told another one. */
  defaultWorkspace: string
}>

export type Located =
  | Readonly<{ kind: 'located'; locations: ServerLocations }>
  | Readonly<{ kind: 'refused'; message: string }>

/** The path functions of the platform the rule runs for, not of the host that runs the test. */
export function pathsOf(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix
}

function absoluteOrUndefined(path: typeof posix, value: string | undefined): string | undefined {
  const text = value?.trim()
  return text !== undefined && text !== '' && path.isAbsolute(text) ? text : undefined
}

function placesOf(
  input: LocationInput,
): Readonly<{ source: ServerLocations['source']; configDir: string; stateDir: string }> | string {
  const path = pathsOf(input.platform)
  const override = input.env[SERVER_HOME_ENV]
  if (override !== undefined) {
    const text = override.trim()
    if (text === '') return `${SERVER_HOME_ENV} is empty`
    if (!path.isAbsolute(text)) return `${SERVER_HOME_ENV} must be an absolute path`
    return {
      source: 'override',
      configDir: path.join(text, 'config'),
      stateDir: path.join(text, 'state'),
    }
  }
  if (input.platform === 'win32') {
    const base =
      absoluteOrUndefined(path, input.env['LOCALAPPDATA']) ??
      path.join(input.home, 'AppData', 'Local')
    return {
      source: 'platform',
      configDir: path.join(base, 'omne', 'config'),
      stateDir: path.join(base, 'omne', 'state'),
    }
  }
  const config =
    absoluteOrUndefined(path, input.env['XDG_CONFIG_HOME']) ?? path.join(input.home, '.config')
  const state =
    absoluteOrUndefined(path, input.env['XDG_STATE_HOME']) ??
    path.join(input.home, '.local', 'state')
  return {
    source: 'platform',
    configDir: path.join(config, 'omne'),
    stateDir: path.join(state, 'omne'),
  }
}

export function resolveLocations(input: LocationInput): Located {
  const places = placesOf(input)
  if (typeof places === 'string') return { kind: 'refused', message: places }
  const path = pathsOf(input.platform)
  const { stateDir } = places
  return {
    kind: 'located',
    locations: {
      ...places,
      settingsFile: path.join(places.configDir, SETTINGS_FILE),
      vaultFile: path.join(stateDir, 'model-vault.json'),
      storageRoot: path.join(stateDir, 'storage'),
      hostFilesDir: path.join(stateDir, 'host-files'),
      defaultWorkspace: path.join(stateDir, 'workspace'),
    },
  }
}
