// `harness-server setup`: the one command that prepares a host for the local single-user server.
// It picks the standard places (`locations.ts`), puts the model credential into the vault of the
// state directory, and writes the settings file. A second run keeps what is there: the settings
// change only with `--reconfigure` (or `--reset` for a file that is not valid), and the credential
// only with `--replace-credential`. A vault that cannot be read is a failure, never "kept".
//
// Order: arguments, places, existing settings, wanted settings, directories, credential, settings
// file. The credential step comes before the settings file, so a settings file means that the
// vault was there when it was written. Nothing that this command prints holds the credential.
import { lstatSync, mkdirSync, statSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  defaultGuard,
  initVault,
  inspectLocalCustodian,
  replaceVaultSecret,
  type PermissionGuard,
  type VaultReplaceFailure,
} from '@omne-harness/model-host-local/vault'
import { pathsOf, resolveLocations, type ServerLocations } from './locations.ts'
import {
  DEFAULT_PORT,
  captureShellEnvironment,
  defaultShell,
  readSettings,
  writeSettings,
  type ServerSettings,
} from './settings.ts'

export const SETUP_USAGE =
  'usage: setup [--port <n>] [--workspace <dir>] [--shell <executable>] [--reconfigure] [--reset] [--replace-credential]'

const SETUP_HELP = `${SETUP_USAGE}

Prepares this host for the local single-user server. Run it once. Run it again to check the setup.

  --port <n>              Loopback port of the server. Default: ${DEFAULT_PORT}.
  --workspace <dir>       Directory the Files and Shell tools work in. Default: <state>/workspace.
  --shell <executable>    Shell of the Shell tool. Default: Windows PowerShell on Windows, /bin/bash elsewhere.
  --reconfigure           Write the settings again from these options and the current environment.
                          Without it, setup keeps them.
  --reset                 Write new settings from the default values and these options, in place of
                          the old ones. Use it when the settings file is not valid.
  --replace-credential    Read a new model credential and replace the one in the vault. A vault file
                          that cannot be read is replaced by a new vault.

The model credential comes from standard input: a hidden prompt on a terminal, else the first line.
Places: OMNE_SERVER_HOME=<dir> moves config and state to <dir>/config and <dir>/state.
`

export type SetupOutput = Readonly<{
  stdout: (text: string) => void
  stderr: (text: string) => void
}>

export type SetupDeps = Readonly<{
  platform: NodeJS.Platform
  env: Readonly<Record<string, string | undefined>>
  /** The user directory. The vault must lie below its real path. */
  home: string
  /** Resolves a relative `--workspace`. */
  cwd: string
  /** Reads the model credential. Called at most once, and only when the vault needs a key. */
  readSecret: () => Promise<string>
  /** POSIX: sets a mode. Absent on Windows, where entries inherit the access control of the user directory. */
  chmod?: (path: string, mode: number) => void
  /** Whether a file exists at the path. Used for the shell executable. */
  isFile: (path: string) => boolean
  /** The guard of the vault files. Default: the vault's own platform guard. */
  vaultGuard?: PermissionGuard
}>

class SetupRefused extends Error {
  readonly code: 1 | 2
  /** The arguments were wrong: the usage line follows the message. */
  readonly usage: boolean

  constructor(message: string, code: 1 | 2, usage = false) {
    super(message)
    this.code = code
    this.usage = usage
  }
}

type Flags = Readonly<{
  port?: number
  workspace?: string
  shell?: string
  reconfigure: boolean
  reset: boolean
  replaceCredential: boolean
  help: boolean
}>

function parsePort(text: string): number {
  const port = Number(text)
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new SetupRefused('--port must be an integer from 1 to 65535', 2, true)
  }
  return port
}

function parseFlags(argv: readonly string[]): Flags {
  let parsed: ReturnType<typeof parseSetupArgs>
  try {
    parsed = parseSetupArgs(argv)
  } catch {
    // The parse error can quote the argument, and an argument can be a key: it is not repeated.
    throw new SetupRefused('unrecognized arguments', 2, true)
  }
  const { values, positionals } = parsed
  if (positionals.length !== 1 || positionals[0] !== 'setup')
    throw new SetupRefused('expected subcommand setup', 2, true)
  return {
    ...(values.port === undefined ? {} : { port: parsePort(values.port) }),
    ...(values.workspace === undefined ? {} : { workspace: values.workspace }),
    ...(values.shell === undefined ? {} : { shell: values.shell }),
    reconfigure: values.reconfigure === true,
    reset: values.reset === true,
    replaceCredential: values['replace-credential'] === true,
    help: values.help === true,
  }
}

function parseSetupArgs(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      workspace: { type: 'string' },
      shell: { type: 'string' },
      reconfigure: { type: 'boolean' },
      reset: { type: 'boolean' },
      'replace-credential': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
}

type Existing =
  /** No settings to keep. `replaced` when a file was there and `--reset` replaces it. */
  | Readonly<{ kind: 'none'; replaced: boolean }>
  | Readonly<{ kind: 'kept'; settings: ServerSettings }>

/**
 * The settings to start from. A file that is not valid is never replaced by default values in
 * silence, not even with `--reconfigure`: only `--reset` replaces it.
 */
function existingSettings(locations: ServerLocations, reset: boolean): Existing {
  const read = readSettings(locations.settingsFile)
  if (read.kind === 'missing') return { kind: 'none', replaced: false }
  if (reset) return { kind: 'none', replaced: true }
  if (read.kind === 'read') return { kind: 'kept', settings: read.settings }
  throw new SetupRefused(
    `the settings at ${locations.settingsFile} are not valid: ${read.reason}\n` +
      'Edit the file to fix it, or run setup again with --reset to replace it with default values.',
    2,
  )
}

function wantedSettings(
  flags: Flags,
  existing: Existing,
  locations: ServerLocations,
  deps: SetupDeps,
): ServerSettings {
  const path = pathsOf(deps.platform)
  const base: ServerSettings =
    existing.kind === 'kept'
      ? existing.settings
      : {
          version: 1,
          port: DEFAULT_PORT,
          workspace: locations.defaultWorkspace,
          shell: defaultShell(deps.platform, deps.env),
          shellEnvironment: captureShellEnvironment(deps.platform, deps.env),
        }
  return {
    ...base,
    // `--reconfigure` takes the environment again, for example after a new tool changed PATH.
    ...(flags.reconfigure
      ? { shellEnvironment: captureShellEnvironment(deps.platform, deps.env) }
      : {}),
    ...(flags.port === undefined ? {} : { port: flags.port }),
    ...(flags.workspace === undefined
      ? {}
      : { workspace: path.resolve(deps.cwd, flags.workspace) }),
    ...(flags.shell === undefined ? {} : { shell: path.resolve(deps.cwd, flags.shell) }),
  }
}

const SETTING_KEYS = ['port', 'workspace', 'shell'] as const

function differences(
  existing: ServerSettings,
  wanted: ServerSettings,
): readonly (typeof SETTING_KEYS)[number][] {
  return SETTING_KEYS.filter(key => existing[key] !== wanted[key])
}

function refuseSilentChange(
  existing: Existing,
  wanted: ServerSettings,
  flags: Flags,
  file: string,
) {
  if (existing.kind !== 'kept' || flags.reconfigure) return
  const changed = differences(existing.settings, wanted)
  if (changed.length === 0) return
  const lines = changed.map(
    key => `  ${key}: ${String(existing.settings[key])} -> ${String(wanted[key])}`,
  )
  throw new SetupRefused(
    `the settings at ${file} have other values:\n${lines.join('\n')}\n` +
      'Run setup again with --reconfigure to change them.',
    2,
  )
}

/** Creates a directory that the server owns and, on POSIX, makes it private to the user. */
function ownDirectory(path: string, deps: SetupDeps): void {
  try {
    mkdirSync(path, { recursive: true, mode: 0o700 })
    deps.chmod?.(path, 0o700)
  } catch (error: unknown) {
    throw new SetupRefused(`cannot prepare the directory ${path}${codeSuffix(error)}`, 1)
  }
}

function prepareWorkspace(path: string, deps: SetupDeps): void {
  let existed = true
  try {
    if (!statSync(path).isDirectory())
      throw new SetupRefused(`the workspace ${path} is not a directory`, 2)
  } catch (error: unknown) {
    if (error instanceof SetupRefused) throw error
    existed = false
  }
  // A workspace that a person named and that exists keeps its mode. A new one is private.
  if (!existed) ownDirectory(path, deps)
}

function codeSuffix(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  return typeof code === 'string' ? ` (${code})` : ''
}

const VAULT_REASONS: Readonly<Record<Exclude<VaultReplaceFailure, 'written-not-private'>, string>> =
  {
    'input-not-terminal': 'standard input is not a terminal',
    'input-cancelled': 'the input was cancelled',
    'input-failed': 'the credential could not be read from standard input',
    'secret-empty': 'the credential is empty',
    'secret-malformed': 'the credential holds a control character',
    'path-invalid': 'the vault path is not valid',
    'path-outside-home':
      'the vault must lie below the user directory (move OMNE_SERVER_HOME below it)',
    'path-check-failed': 'a parent of the vault path cannot be examined',
    'path-occupied': 'something is already on the vault path',
    'vault-unavailable': 'the vault cannot be read',
    'lock-timeout': 'the vault is locked by another process',
    'write-failed': 'the vault could not be written',
    'write-unconfirmed':
      'the vault does not hold the new credential after the write; check the file',
    'permission-failed': 'the vault file could not be made private to this user',
  }

type CredentialStep = 'created' | 'replaced' | 'rebuilt' | 'kept'

type PathKind = 'none' | 'file' | 'directory' | 'other'

function pathKind(path: string): PathKind {
  try {
    const entry = lstatSync(path)
    if (entry.isFile()) return 'file'
    return entry.isDirectory() ? 'directory' : 'other'
  } catch {
    return 'none'
  }
}

/** A vault path that holds something that is not a file: setup never removes it. */
function notAFile(path: string): SetupRefused {
  return new SetupRefused(
    `the model credential vault path ${path} holds a directory or a link, not a vault file\n` +
      'Remove it, then run setup again.',
    1,
  )
}

function storeFailure(path: string, reason: VaultReplaceFailure): SetupRefused {
  if (reason === 'written-not-private')
    return new SetupRefused(
      `the new model credential was written to ${path}, but the file could not be made private to this user (mode 0600)\n` +
        `Set the mode yourself (chmod 600 ${path}), then run setup again to check it.`,
      1,
    )
  return new SetupRefused(`model credential not stored: ${VAULT_REASONS[reason]}`, 1)
}

/**
 * The vault step. An existing vault is opened (under its lock), not only found: one that cannot be
 * read stops setup with exit 1 and the way to fix it. With `--replace-credential` a vault file that
 * cannot be read is replaced by a new vault. A directory or a link on the path is never removed.
 */
async function storeCredential(
  locations: ServerLocations,
  flags: Flags,
  deps: SetupDeps,
): Promise<CredentialStep> {
  const path = locations.vaultFile
  const guard = deps.vaultGuard ?? defaultGuard()
  const home = () => deps.home
  const kind = pathKind(path)
  if (kind === 'none') {
    const built = await initVault(path, { readSecret: deps.readSecret, guard, home })
    if (!built.ok) throw storeFailure(path, built.reason)
    return 'created'
  }
  if (kind !== 'file') throw notAFile(path)
  const inspected = inspectLocalCustodian({ path })
  if (inspected.kind === 'unavailable' && inspected.cause === 'locked')
    throw new SetupRefused(`model credential not checked: ${VAULT_REASONS['lock-timeout']}`, 1)
  if (!flags.replaceCredential) {
    if (inspected.kind === 'readable') return 'kept'
    throw new SetupRefused(
      `the model credential vault ${path} cannot be read (${inspected.cause})\n` +
        'Run setup again with --replace-credential to build a new vault with a new credential.',
      1,
    )
  }
  const result = await replaceVaultSecret(path, {
    readSecret: deps.readSecret,
    guard,
    home,
    rebuildUnreadable: true,
  })
  if (!result.ok) throw storeFailure(path, result.reason)
  return result.rebuilt ? 'rebuilt' : 'replaced'
}

function checkShell(settings: ServerSettings, deps: SetupDeps): void {
  if (!pathsOf(deps.platform).isAbsolute(settings.shell) || !deps.isFile(settings.shell))
    throw new SetupRefused(
      `the shell ${settings.shell} is not an existing file; name one with --shell`,
      2,
    )
}

type SettingsStep = 'created' | 'updated' | 'kept' | 'reset'

function summary(input: {
  locations: ServerLocations
  settings: ServerSettings
  settingsStep: SettingsStep
  credential: CredentialStep
}): string {
  const { locations, settings } = input
  const credential =
    input.credential === 'kept'
      ? 'kept (run setup --replace-credential to change it)'
      : input.credential === 'rebuilt'
        ? 'rebuilt: the old vault could not be read'
        : input.credential
  return [
    'harness-server setup: done.',
    `  settings     ${locations.settingsFile} (${input.settingsStep})`,
    `  state        ${locations.stateDir}`,
    `  credential   ${locations.vaultFile} (${credential})`,
    ...(input.credential === 'rebuilt'
      ? [
          '  warning      the tenant model credentials of the old vault are gone. Each tenant uses the',
          '               deployment default until it runs `omne credential set` again.',
        ]
      : []),
    `  workspace    ${settings.workspace}`,
    `  shell        ${settings.shell}`,
    `  address      http://127.0.0.1:${settings.port}`,
    'Next:',
    '  harness-server serve',
    '  then, in another terminal: omne register --login-identifier <name>',
    '',
  ].join('\n')
}

/** Runs `setup` and returns the exit code: 0 done, 1 a step failed, 2 a usage or settings refusal. */
export async function runSetup(
  argv: readonly string[],
  output: SetupOutput,
  deps: SetupDeps,
): Promise<0 | 1 | 2> {
  try {
    const flags = parseFlags(argv)
    if (flags.help) {
      output.stdout(SETUP_HELP)
      return 0
    }
    const located = resolveLocations({ platform: deps.platform, env: deps.env, home: deps.home })
    if (located.kind === 'refused') throw new SetupRefused(located.message, 2)
    const { locations } = located
    const existing = existingSettings(locations, flags.reset)
    const settings = wantedSettings(flags, existing, locations, deps)
    refuseSilentChange(existing, settings, flags, locations.settingsFile)
    checkShell(settings, deps)

    ownDirectory(locations.configDir, deps)
    ownDirectory(locations.stateDir, deps)
    ownDirectory(locations.hostFilesDir, deps)
    prepareWorkspace(settings.workspace, deps)
    const credential = await storeCredential(locations, flags, deps)

    const changed =
      existing.kind === 'none' || JSON.stringify(existing.settings) !== JSON.stringify(settings)
    if (changed) {
      try {
        writeSettings(locations.settingsFile, settings, path => {
          deps.chmod?.(path, 0o600)
        })
      } catch (error: unknown) {
        throw new SetupRefused(
          `cannot write the settings ${locations.settingsFile}${codeSuffix(error)}`,
          1,
        )
      }
    }
    const settingsStep: SettingsStep =
      existing.kind === 'none'
        ? existing.replaced
          ? 'reset'
          : 'created'
        : changed
          ? 'updated'
          : 'kept'
    output.stdout(summary({ locations, settings, settingsStep, credential }))
    return 0
  } catch (error: unknown) {
    if (!(error instanceof SetupRefused)) throw error
    output.stderr(`setup: ${error.message}\n`)
    if (error.usage) output.stderr(`${SETUP_USAGE}\n`)
    return error.code
  }
}
