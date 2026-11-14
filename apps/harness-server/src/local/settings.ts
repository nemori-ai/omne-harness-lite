import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { pathsOf } from './locations.ts'

export const DEFAULT_PORT = 8787

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

const SECRET_NAME = /(TOKEN|KEY|SECRET|PASSWORD|PASSWD|CREDENTIAL)S?$|^OPENROUTER_/i

export function isSecretName(name: string): boolean {
  return SECRET_NAME.test(name)
}

const storageLimitsSchema = z.strictObject({
  maxWorkers: z.number().int().min(1).optional(),
  reservedWriterSlots: z.number().int().min(0).optional(),
  maxReadWorkersPerDomain: z.number().int().min(1).optional(),
})

export type StorageLimits = z.infer<typeof storageLimitsSchema>

const settingsSchema = z.strictObject({
  version: z.literal(1),
  port: z.number().int().min(1).max(65535),
  workspace: z.string().min(1),
  shell: z.string().min(1),
  shellEnvironment: z
    .record(z.string().min(1), z.string())
    .refine(env => !Object.keys(env).some(isSecretName), {
      message: 'names a variable that looks like a secret',
    }),
  storage: storageLimitsSchema.optional(),
})

export type ServerSettings = z.infer<typeof settingsSchema>

export type SettingsRead =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'read'; settings: ServerSettings }>
  | Readonly<{ kind: 'invalid'; reason: string }>

export function defaultShell(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (platform !== 'win32') return '/bin/bash'
  const path = pathsOf(platform)
  const systemRoot = environmentValue(platform, env, 'SystemRoot')?.trim() || 'C:\\Windows'
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

export function environmentValue(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  if (platform !== 'win32') return env[name]
  const wanted = name.toUpperCase()
  return Object.entries(env).find(([key]) => key.toUpperCase() === wanted)?.[1]
}

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
    } catch {}
    throw error
  }
}
