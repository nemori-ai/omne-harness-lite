import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COOKIE_KEY_WRITER_FAILED_FILE, COOKIE_KEY_WRITER_SWITCH } from '../startup-signals.ts'

// Windows writes the cookie key to Local State only ~10 s in or at a clean quit: a launch without one
// first runs a copy that makes it, quits and prints a probe (until Electron issue 55978 is fixed).

export const COOKIE_KEY_WRITER_TIMEOUT_MS = 5_000
export const COOKIE_KEY_FAILURE_TTL_MS = 24 * 60 * 60 * 1000
export const COOKIE_KEY_READ_ATTEMPTS = 5
export const COOKIE_KEY_READ_RETRY_MS = 50
export const COOKIE_KEY_WRITER_CRASH_STATUS = 1
export const COOKIE_KEY_PROBE_TEXT = 'cookie key probe'
export const COOKIE_KEY_PROBE_PREFIX = 'COOKIE_KEY_PROBE '

export type CookieKeyState =
  | Readonly<{ state: 'stored' }>
  | Readonly<{ state: 'missing' }>
  | Readonly<{ state: 'unknown'; reason: string }>

const errorCode = (failure: unknown): unknown => (failure as { code?: unknown } | null)?.code
const describe = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure)
const readText = (path: string): string => readFileSync(path, 'utf8')

/** What Local State says: `missing` only for no file or a parsed file without a key. Never throws. */
export function readCookieKeyState(
  userData: string,
  read: (path: string) => string = readText,
): CookieKeyState {
  let text: string
  try {
    text = read(join(userData, 'Local State'))
  } catch (failure) {
    if (errorCode(failure) === 'ENOENT') return { state: 'missing' }
    return { state: 'unknown', reason: describe(failure) }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (failure) {
    return { state: 'unknown', reason: `Local State does not parse: ${describe(failure)}` }
  }
  const crypt = (parsed as { os_crypt?: { encrypted_key?: unknown } } | null)?.os_crypt
  const key = crypt?.encrypted_key
  return typeof key === 'string' && key !== '' ? { state: 'stored' } : { state: 'missing' }
}

export type CookieKeyLaunch = Readonly<{
  platform: NodeJS.Platform
  userData: string
  execPath: string
  /** Unpackaged only: the app directory the copy is started on. */
  appPath: string | undefined
  appVersion: string
}>

export type CookieKeyOutcome =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'skipped'; failedAt: string }>
  | Readonly<{
      kind: 'ran'
      ms: number
      key: 'stored' | 'missing' | 'unknown'
      readError?: string
      status: number | null
      error?: string
      probe?: string
    }>

export type CookieKeySpawn = (
  command: string,
  args: string[],
  options: { stdio: ['ignore', 'pipe', 'ignore']; encoding: 'latin1'; timeout: number },
) => { status: number | null; error?: Error; stdout: string | null }

export const cookieKeyWriterArgs = ({
  userData,
  appPath,
}: Pick<CookieKeyLaunch, 'userData' | 'appPath'>): string[] => [
  ...(appPath === undefined ? [] : [appPath]),
  `--user-data-dir=${userData}`,
  '--disable-gpu',
  `--${COOKIE_KEY_WRITER_SWITCH}`,
]

export type CookieKeyDeps = Readonly<{
  spawn: CookieKeySpawn
  read: (path: string) => string
  write: (path: string, text: string) => void
  remove: (path: string) => void
  sleep: (ms: number) => void
  now: () => number
  date: () => Date
  timeoutMs: number
}>

const machine: CookieKeyDeps = {
  spawn: (command, args, options) => spawnSync(command, args, options),
  read: readText,
  write: (path, text) => writeFileSync(path, text),
  remove: path => rmSync(path, { force: true }),
  sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  now: () =>
    /* wall-clock: operation-timing -- the key writer's run time, compared only with itself */ performance.now(),
  date: () =>
    /* wall-clock: observation-time -- when a writer run failed, for its one-day record */ new Date(),
  timeoutMs: COOKIE_KEY_WRITER_TIMEOUT_MS,
}

/** A failure record of this version from the last day holds; any other record does not. */
function previousFailure(
  path: string,
  read: (path: string) => string,
  version: string,
  now: Date,
): string | undefined {
  let record: { failedAt?: unknown; version?: unknown }
  try {
    record = JSON.parse(read(path))
  } catch {
    return undefined
  }
  if (typeof record?.failedAt !== 'string' || record.version !== version) return undefined
  const age = now.getTime() - Date.parse(record.failedAt)
  return age >= 0 && age < COOKIE_KEY_FAILURE_TTL_MS ? record.failedAt : undefined
}

/** Windows: with no key in Local State, runs the writer and waits for it. Call holding the lock. */
export function storeCookieKeyFirst(
  launch: CookieKeyLaunch,
  overrides: Partial<CookieKeyDeps> = {},
): CookieKeyOutcome {
  const deps = { ...machine, ...overrides }
  const { platform, userData, execPath, appVersion } = launch
  if (platform !== 'win32') return { kind: 'none' }
  const failedFile = join(userData, COOKIE_KEY_WRITER_FAILED_FILE)
  const forget = () => {
    try {
      deps.remove(failedFile)
    } catch {}
  }
  if (readCookieKeyState(userData, deps.read).state === 'stored') {
    forget()
    return { kind: 'none' }
  }
  const failedAt = previousFailure(failedFile, deps.read, appVersion, deps.date())
  if (failedAt !== undefined) return { kind: 'skipped', failedAt }

  const start = deps.now()
  const result = deps.spawn(execPath, cookieKeyWriterArgs(launch), {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'latin1',
    timeout: deps.timeoutMs,
  })
  const ms = Math.round(deps.now() - start)
  let key = readCookieKeyState(userData, deps.read)
  for (let attempt = 1; key.state === 'unknown' && attempt < COOKIE_KEY_READ_ATTEMPTS; attempt++) {
    deps.sleep(COOKIE_KEY_READ_RETRY_MS)
    key = readCookieKeyState(userData, deps.read)
  }
  const probe = parseCookieKeyProbe(result.stdout ?? '')
  const outcome: CookieKeyOutcome = {
    kind: 'ran',
    ms,
    key: key.state,
    ...(key.state === 'unknown' ? { readError: key.reason } : {}),
    status: result.status,
    ...(result.error ? { error: String(result.error) } : {}),
    ...(probe === undefined ? {} : { probe }),
  }
  if (key.state === 'stored') forget()
  else if (key.state === 'missing')
    try {
      const record = {
        failedAt: deps.date().toISOString(),
        version: appVersion,
        status: result.status,
      }
      deps.write(failedFile, `${JSON.stringify(record)}\n`)
    } catch {}
  return outcome
}

export const cookieKeyWriterCrashHandler =
  (exit: (code: number) => void): (() => void) =>
  () =>
    exit(COOKIE_KEY_WRITER_CRASH_STATUS)

export const cookieKeyProbeLine = (encrypted: Uint8Array): string =>
  `${COOKIE_KEY_PROBE_PREFIX}${Buffer.from(encrypted).toString('base64')}\n`

export function parseCookieKeyProbe(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(COOKIE_KEY_PROBE_PREFIX)) continue
    const value = line.slice(COOKIE_KEY_PROBE_PREFIX.length).trim()
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return value
  }
  return undefined
}

export function checkCookieKeyProbe(
  probe: string,
  decrypt: (encrypted: Buffer) => string,
): Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }> {
  try {
    const text = decrypt(Buffer.from(probe, 'base64'))
    return text === COOKIE_KEY_PROBE_TEXT
      ? { ok: true }
      : { ok: false, reason: 'decrypted to other text' }
  } catch (failure) {
    return { ok: false, reason: describe(failure) }
  }
}
