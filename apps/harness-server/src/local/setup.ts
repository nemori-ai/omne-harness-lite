// `harness-server setup`: the one command that prepares a host for the local single-user server.
// It picks the standard places (`locations.ts`), puts the model credential into the vault of the
// state directory, and writes the settings file. A second run keeps what is there: the settings
// change only with `--reconfigure`, and the credential only with `--replace-credential`.
//
// Order: arguments, places, existing settings, wanted settings, directories, credential, settings
// file. The credential step comes before the settings file, so a settings file means that the
// vault was there when it was written. Nothing that this command prints holds the credential.
import { mkdirSync, statSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  defaultGuard,
  initVault,
  replaceVaultSecret,
  type PermissionGuard,
  type VaultInitFailure,
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
  'usage: setup [--port <n>] [--workspace <dir>] [--shell <executable>] [--reconfigure] [--replace-credential]'

const SETUP_HELP = `${SETUP_USAGE}

Prepares this host for the local single-user server. Run it once. Run it again to check the setup.

  --port <n>              Loopback port of the server. Default: ${DEFAULT_PORT}.
  --workspace <dir>       Directory the Files and Shell tools work in. Default: <state>/workspace.
  --shell <executable>    Shell of the Shell tool. Default: Windows PowerShell on Windows, /bin/bash elsewhere.
  --reconfigure           Write the settings again from these options and the current environment.
                          Without it, setup keeps them.
  --replace-credential    Read a new model credential and replace the one in the vault.

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
      'replace-credential': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
}

type Existing = Readonly<{ kind: 'none' }> | Readonly<{ kind: 'kept'; settings: ServerSettings }>

function existingSettings(locations: ServerLocations, reconfigure: boolean): Existing {
  const read = readSettings(locations.settingsFile)
  if (read.kind === 'read') return { kind: 'kept', settings: read.settings }
  if (read.kind === 'missing' || reconfigure) return { kind: 'none' }
  throw new SetupRefused(
    `the settings at ${locations.settingsFile} are not valid: ${read.reason}\n` +
      'Run setup again with --reconfigure to write new settings.',
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

const VAULT_REASONS: Readonly<Record<VaultInitFailure | VaultReplaceFailure, string>> = {
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
  'write-unconfirmed': 'the vault does not hold the new credential after the write; check the file',
  'permission-failed': 'the vault file could not be made private to this user',
}

type CredentialStep = 'created' | 'replaced' | 'kept'

function vaultExists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

async function storeCredential(
  locations: ServerLocations,
  flags: Flags,
  deps: SetupDeps,
): Promise<CredentialStep> {
  const guard = deps.vaultGuard ?? defaultGuard()
  const present = vaultExists(locations.vaultFile)
  if (present && !flags.replaceCredential) return 'kept'
  const result = present
    ? await replaceVaultSecret(locations.vaultFile, { readSecret: deps.readSecret, guard })
    : await initVault(locations.vaultFile, {
        readSecret: deps.readSecret,
        guard,
        home: () => deps.home,
      })
  if (!result.ok)
    throw new SetupRefused(`model credential not stored: ${VAULT_REASONS[result.reason]}`, 1)
  return present ? 'replaced' : 'created'
}

function checkShell(settings: ServerSettings, deps: SetupDeps): void {
  if (!pathsOf(deps.platform).isAbsolute(settings.shell) || !deps.isFile(settings.shell))
    throw new SetupRefused(
      `the shell ${settings.shell} is not an existing file; name one with --shell`,
      2,
    )
}

function summary(input: {
  locations: ServerLocations
  settings: ServerSettings
  settingsStep: 'created' | 'updated' | 'kept'
  credential: CredentialStep
}): string {
  const { locations, settings } = input
  const credential =
    input.credential === 'kept'
      ? 'kept (run setup --replace-credential to change it)'
      : input.credential
  return [
    'harness-server setup: done.',
    `  settings     ${locations.settingsFile} (${input.settingsStep})`,
    `  state        ${locations.stateDir}`,
    `  credential   ${locations.vaultFile} (${credential})`,
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
    const existing = existingSettings(locations, flags.reconfigure)
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
    const settingsStep = existing.kind === 'none' ? 'created' : changed ? 'updated' : 'kept'
    output.stdout(summary({ locations, settings, settingsStep, credential }))
    return 0
  } catch (error: unknown) {
    if (!(error instanceof SetupRefused)) throw error
    output.stderr(`setup: ${error.message}\n`)
    if (error.usage) output.stderr(`${SETUP_USAGE}\n`)
    return error.code
  }
}
