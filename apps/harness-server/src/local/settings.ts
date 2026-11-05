// The local server settings: the choices a person makes once with `setup`. The file holds no secret
// and no number of the operator layer. Those numbers stay in code (`operator-defaults.ts`), so a new
// release brings its own numbers without a new `setup`.
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { pathsOf } from './locations.ts'

/** The port of `server-entry` when `setup` is not told another one. It is the `omne` CLI default too. */
export const DEFAULT_PORT = 8787

/**
 * The variables `setup` copies from its own environment into the settings, for the Shell tool. It
 * is an allowlist: the shell never gets the whole environment of the host. The temp directory is
 * not here: `serve` points it at the host files directory, which the server owns.
 * `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` locate the user service manager, so that a
 * command can use `systemctl --user` as the person can. They are not a security boundary: a
 * command can derive them from its own user id.
 */
export const SHELL_ENVIRONMENT_ALLOWLIST: Readonly<Record<'windows' | 'posix', readonly string[]>> =
  {
    windows: [
      'PATH',
      'PATHEXT',
      'SystemRoot',
      'SystemDrive',
      'WINDIR',
      'ComSpec',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'ProgramData',
      'ProgramFiles',
      'ProgramFiles(x86)',
    ],
    posix: [
      'PATH',
      'HOME',
      'USER',
      'LANG',
      'LC_ALL',
      'XDG_RUNTIME_DIR',
      'DBUS_SESSION_BUS_ADDRESS',
    ],
  }

/**
 * A name that looks as if its value is a secret. Such a variable never enters the shell
 * environment, even when a person writes it into the settings file by hand.
 */
const SECRET_NAME = /(TOKEN|KEY|SECRET|PASSWORD|PASSWD|CREDENTIAL)S?$|^OPENROUTER_/i

export function isSecretName(name: string): boolean {
  return SECRET_NAME.test(name)
}

const settingsSchema = z.strictObject({
  version: z.literal(1),
  /** The loopback port of `server-entry`. */
  port: z.number().int().min(1).max(65535),
  /** The absolute directory that the Files and Shell tools work in. */
  workspace: z.string().min(1),
  /** The absolute path of the shell executable of the Shell tool. */
  shell: z.string().min(1),
  /** The environment of the Shell tool: the allowlist values that `setup` saw. */
  shellEnvironment: z
    .record(z.string().min(1), z.string())
    .refine(env => !Object.keys(env).some(isSecretName), {
      message: 'names a variable that looks like a secret',
    }),
})

export type ServerSettings = z.infer<typeof settingsSchema>

export type SettingsRead =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'read'; settings: ServerSettings }>
  | Readonly<{ kind: 'invalid'; reason: string }>

/**
 * The shell of the Shell tool when `setup` is not told another one: Windows PowerShell, which every
 * Windows host has, and `/bin/bash` elsewhere.
 */
export function defaultShell(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (platform !== 'win32') return '/bin/bash'
  const path = pathsOf(platform)
  const systemRoot = environmentValue(platform, env, 'SystemRoot')?.trim() || 'C:\\Windows'
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** A variable by name. Windows compares names without case (`Path` is `PATH`), POSIX with case. */
export function environmentValue(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  if (platform !== 'win32') return env[name]
  const wanted = name.toUpperCase()
  return Object.entries(env).find(([key]) => key.toUpperCase() === wanted)?.[1]
}

/** The allowlist values of `env`, under the names of the allowlist. Absent and empty values are left out. */
export function captureShellEnvironment(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const names = SHELL_ENVIRONMENT_ALLOWLIST[platform === 'win32' ? 'windows' : 'posix']
  const captured: Record<string, string> = {}
  for (const name of names) {
    const value = environmentValue(platform, env, name)
    if (value !== undefined && value !== '') captured[name] = value
  }
  return captured
}

export function parseSettings(value: unknown): SettingsRead {
  const parsed = settingsSchema.safeParse(value)
  if (parsed.success) return { kind: 'read', settings: parsed.data }
  const issue = parsed.error.issues[0]
  const where = issue === undefined || issue.path.length === 0 ? '' : `${issue.path.join('.')}: `
  return { kind: 'invalid', reason: `${where}${issue?.message ?? 'not valid'}` }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined
}

export function readSettings(file: string): SettingsRead {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') return { kind: 'missing' }
    return { kind: 'invalid', reason: `cannot be read (${errorCode(error) ?? 'error'})` }
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { kind: 'invalid', reason: 'is not JSON' }
  }
  return parseSettings(value)
}

let temporaryCounter = 0

/**
 * Writes the settings through a temporary file and a rename, so that a reader sees the old file or
 * the new one. The file is created with mode `0600`, and `narrow` closes it before the rename: on
 * POSIX the caller sets the mode again, because the creation mask can only take bits away.
 */
export function writeSettings(
  file: string,
  settings: ServerSettings,
  narrow: (path: string) => void,
): void {
  const temporary = `${file}.${process.pid}.${temporaryCounter++}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    narrow(temporary)
    renameSync(temporary, file)
  } catch (error: unknown) {
    try {
      unlinkSync(temporary)
    } catch {
      // The temporary file may not exist. Its removal is best-effort.
    }
    throw error
  }
}
