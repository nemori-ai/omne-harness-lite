// The file custody of secret bindings: one JSON file, a file lock for writers, an atomic publish
// (temporary file, fsync, rename), and a read of the whole file on every answer. The handle keeps
// no cache of the bindings: a change by another process or by hand is seen by the next call. It
// implements the two ports of `@omne-harness/settings` and gives trusted adapters the whole
// snapshot and a locked revision, the two things a judgment over several bindings needs.
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { lockSync } from 'proper-lockfile'
import type {
  SecretBindingKey,
  SecretCustodyManagement,
  SecretCustodyUse,
  SecretListCursor,
  SecretListEntry,
  SecretListPage,
  SecretPresence,
  SecretText,
  SecretWriteResult,
} from '@omne-harness/settings'
import type { Instant } from '@omne-harness/utc-instant'
import {
  isMintedScope,
  loadState,
  sameKey,
  sameScope,
  storeState,
  type SecretRecord,
  type SecretState,
} from './records.ts'

/** Why a vault file cannot be read: absent, not a vault, or a file-system error. */
export type UnavailableCause = 'missing' | 'corrupt' | 'io'

export type SecretVaultOptions = Readonly<{
  path: string
  /** How long a writer waits for the file lock before it gives up. Default: 30 000. */
  lockWaitMs?: number
  /** The pause between two attempts to take the lock. Default: 50. */
  lockBackoffMs?: number
}>

/** The whole vault, read now. The one face that carries values; only trusted adapters hold it. */
export type SecretVaultSnapshot = Readonly<{ bindings: readonly SecretRecord[] }>

/**
 * An open vault: the management face, the use face, and what a trusted adapter needs beyond them.
 * `revise` is one locked read-change-write over the whole binding list; `undefined` from `change`
 * writes nothing and answers `written`.
 */
export type SecretVault = SecretCustodyManagement &
  SecretCustodyUse &
  Readonly<{
    path: string
    snapshot(): SecretVaultSnapshot | 'unavailable'
    revise(
      change: (bindings: readonly SecretRecord[]) => readonly SecretRecord[] | undefined,
    ): SecretWriteResult
    /** Marks this handle closed. Every face then answers `denied`; the file is not changed. */
    close(): void
  }>

export type OpenSecretVaultResult =
  | Readonly<{ kind: 'open'; vault: SecretVault }>
  | Readonly<{ kind: 'unavailable'; cause: UnavailableCause }>

/** A binding that a new vault starts with. Only used when the file is built, never on adoption. */
export type SecretSeed = Readonly<{
  key: SecretBindingKey
  secret: SecretText
  configuredAt: Instant | null
}>

export type CreateSecretVaultOptions = SecretVaultOptions &
  Readonly<{ seed?: readonly SecretSeed[] }>

/**
 * `created` tells whether the file was built now or adopted. `locked`: the lock wait ran out.
 * `unavailable`: a file is on the path that cannot be read as a vault; it is not replaced.
 */
export type CreateSecretVaultResult =
  | Readonly<{ kind: 'open'; vault: SecretVault; created: boolean }>
  | Readonly<{ kind: 'unavailable'; cause: Exclude<UnavailableCause, 'missing'> }>
  | Readonly<{ kind: 'locked' }>
  | Readonly<{ kind: 'not-written' }>
  | Readonly<{ kind: 'unconfirmed' }>

type Lock = Readonly<{ waitMs: number; backoffMs: number }>
type Settings = Readonly<{ path: string; lock: Lock }>

const DEFAULT_LOCK: Lock = { waitMs: 30_000, backoffMs: 50 }

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function requireIntegerAtLeast(value: unknown, name: string, minimum: number): number {
  if (!isIntegerAtLeast(value, minimum))
    throw new TypeError(`${name} must be an integer of at least ${minimum}, got ${String(value)}`)
  return value
}

// Only an absent option takes its default. A caller outside the type system can hand in `null`,
// `NaN` or a string; `NaN` would make the lock wait endless, so every value is checked before the
// lock is taken or the disk is read.
function settle(options: SecretVaultOptions): Settings {
  if (typeof options.path !== 'string' || options.path === '')
    throw new TypeError('path must be a non-empty string')
  const orDefault = (value: unknown, fallback: number): unknown =>
    value === undefined ? fallback : value
  return {
    path: options.path,
    lock: {
      waitMs: requireIntegerAtLeast(
        orDefault(options.lockWaitMs, DEFAULT_LOCK.waitMs),
        'lockWaitMs',
        0,
      ),
      backoffMs: requireIntegerAtLeast(
        orDefault(options.lockBackoffMs, DEFAULT_LOCK.backoffMs),
        'lockBackoffMs',
        0,
      ),
    },
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined
}

// proper-lockfile's time-based takeover is disabled by a `stale` of the largest safe integer: no
// finite clock jump can make a live holder's lock appear stale, so another writer cannot steal it.
// The lockfile mtime is still refreshed within Node's timer limit. Crash recovery is manual: a
// leftover `${path}.lock` means the owning process died and an operator removes it after all
// writers are stopped.
const STALE_NEVER_MS = Number.MAX_SAFE_INTEGER
const LOCK_UPDATE_MS = 2 ** 31 - 1

class LockTimeout extends Error {
  readonly code = 'ELOCKED'
}

function acquireLockSync(path: string, lock: Lock): () => void {
  const deadline =
    /* wall-clock: operation-timing -- Measure local lock wait. */ Date.now() + lock.waitMs
  while (true) {
    try {
      return lockSync(path, { realpath: false, stale: STALE_NEVER_MS, update: LOCK_UPDATE_MS })
    } catch (error: unknown) {
      if (errorCode(error) !== 'ELOCKED') throw error
      const remaining =
        deadline - /* wall-clock: operation-timing -- Measure local lock wait. */ Date.now()
      if (remaining <= 0) throw new LockTimeout(`timed out waiting for the vault lock at ${path}`)
      // Back off without yielding the event loop, since the faces are synchronous. A pause never
      // runs past the deadline, so `waitMs` stays the upper bound even when `backoffMs` is larger.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        Math.min(lock.backoffMs, remaining),
      )
    }
  }
}

/** The name `atomicSave` gives a temporary file of the vault at `path`: `<name>.<pid>.<ms>.<n>.tmp`. */
function isOwnTemporary(path: string, name: string): boolean {
  const prefix = `${basename(path)}.`
  return name.startsWith(prefix) && /^\d+\.\d+\.\d+\.tmp$/.test(name.slice(prefix.length))
}

/**
 * Removes the temporary files of this vault that a publish left behind when its process ended
 * between the write and the rename. Such a file can hold the whole snapshot. The caller holds the
 * file lock, so no live writer is in the middle of its own temporary file. Only names of the
 * `atomicSave` pattern for this vault are removed. A failure to list or remove is ignored.
 */
function sweepTemporaries(path: string): void {
  const directory = dirname(path)
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return
  }
  for (const name of names) {
    if (!isOwnTemporary(path, name)) continue
    try {
      unlinkSync(join(directory, name))
    } catch {
      // Best-effort: the next holder of the lock tries again.
    }
  }
}

/** Takes the file lock, then removes leftover temporary files of this vault. */
function lockAndSweep(path: string, lock: Lock): () => void {
  const release = acquireLockSync(path, lock)
  sweepTemporaries(path)
  return release
}

type Refreshed =
  | Readonly<{ kind: 'state'; state: SecretState }>
  | Readonly<{ kind: 'unavailable'; cause: UnavailableCause }>

// The parse error is not kept: its message can quote the file, and the file holds secrets.
function refresh(path: string): Refreshed {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error: unknown) {
    return { kind: 'unavailable', cause: errorCode(error) === 'ENOENT' ? 'missing' : 'io' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'unavailable', cause: 'corrupt' }
  }
  const loaded = loadState(parsed)
  return loaded ? { kind: 'state', state: loaded } : { kind: 'unavailable', cause: 'corrupt' }
}

type Saved =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; phase: 'temp-write' | 'published'; cause: unknown }>

let tmpCounter = 0

function writeAll(fd: number, data: string): void {
  const buffer = Buffer.from(data)
  let offset = 0
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset)
    if (written === 0) throw new Error('file write made no progress')
    offset += written
  }
}

function exists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * Publishes the state: a unique temporary file, `fsync`, rename over the vault, and on POSIX an
 * `fsync` of the parent directory. `published` means the vault may already show the new state:
 * the rename returned, or it threw and the temporary file is gone, so the replace may have landed.
 */
function atomicSave(path: string, state: SecretState): Saved {
  const tmpPath = `${path}.${process.pid}.${/* wall-clock: internal-name -- Name a temporary vault file. */ Date.now()}.${tmpCounter++}.tmp`
  let fd: number | undefined
  let phase: 'temp-write' | 'published' = 'temp-write'
  let renaming = false
  try {
    fd = openSync(tmpPath, 'w')
    writeAll(fd, JSON.stringify(storeState(state)))
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renaming = true
    renameSync(tmpPath, path)
    phase = 'published'
    // Windows cannot fsync a directory handle, so there the rename is the last step.
    if (process.platform !== 'win32') {
      const dirFd = openSync(dirname(path), 'r')
      try {
        fsyncSync(dirFd)
      } finally {
        closeSync(dirFd)
      }
    }
    return { ok: true }
  } catch (error: unknown) {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // Cleanup of a half-open file descriptor is best-effort.
      }
    }
    if (renaming && phase === 'temp-write' && !exists(tmpPath)) phase = 'published'
    // The temporary file is unique to this call. After a rename it is gone and the unlink fails
    // safely; otherwise the partial snapshot is removed.
    try {
      unlinkSync(tmpPath)
    } catch {
      // Cleanup of the temporary file is best-effort.
    }
    return { ok: false, phase, cause: error }
  }
}

type Mutation = 'written' | 'not-written' | 'unconfirmed' | 'locked'

/**
 * One locked read, change and write. `change` answers `undefined` to write nothing; the result is
 * then `written` and the file stays as it was. A failure before the new file replaced the old one
 * is `not-written`; a failure after that is `unconfirmed`; a lock wait that ran out is `locked`.
 */
function attemptMutation(
  settings: Settings,
  change: (state: SecretState) => SecretState | undefined,
): Mutation {
  let release: () => void
  try {
    release = lockAndSweep(settings.path, settings.lock)
  } catch (error: unknown) {
    return error instanceof LockTimeout ? 'locked' : 'not-written'
  }
  try {
    const refreshed = refresh(settings.path)
    if (refreshed.kind === 'unavailable') return 'not-written'
    const next = change(refreshed.state)
    if (next === undefined) return 'written'
    const saved = atomicSave(settings.path, next)
    if (saved.ok) return 'written'
    return saved.phase === 'published' ? 'unconfirmed' : 'not-written'
  } finally {
    release()
  }
}

function asWrite(mutation: Mutation): SecretWriteResult {
  return mutation === 'locked' ? 'not-written' : mutation
}

function presenceOf(record: SecretRecord | undefined): SecretPresence {
  return record === undefined
    ? { kind: 'unbound' }
    : { kind: 'bound', life: record.life, configuredAt: record.configuredAt }
}

type SortKey = readonly [owner: string, key: string, purpose: string]

function sortKeyOf(key: SecretBindingKey): SortKey {
  return [key.target.owner, key.target.key, key.purpose]
}

function compareSortKeys(left: SortKey, right: SortKey): number {
  for (let index = 0; index < 3; index++) {
    const a = left[index] ?? ''
    const b = right[index] ?? ''
    if (a < b) return -1
    if (a > b) return 1
  }
  return 0
}

// The cursor is the sort key of the last entry of the page, in a form the caller does not read.
function encodeCursor(key: SortKey): SecretListCursor {
  return { after: Buffer.from(JSON.stringify(key), 'utf8').toString('base64url') }
}

function decodeCursor(cursor: SecretListCursor): SortKey {
  const refuse = () => new TypeError('the list cursor is not one this custody issued')
  if (typeof cursor !== 'object' || cursor === null || typeof cursor.after !== 'string')
    throw refuse()
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor.after, 'base64url').toString('utf8'))
  } catch {
    throw refuse()
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    !parsed.every(member => typeof member === 'string')
  )
    throw refuse()
  return [parsed[0] as string, parsed[1] as string, parsed[2] as string]
}

function live(settings: Settings): SecretVault {
  const { path } = settings
  let closed = false
  const current = (): SecretState | 'unavailable' => {
    const refreshed = refresh(path)
    return refreshed.kind === 'state' ? refreshed.state : 'unavailable'
  }
  const find = (bindings: readonly SecretRecord[], key: SecretBindingKey) =>
    bindings.find(item => sameKey(item.key, key))
  const revise: SecretVault['revise'] = change => {
    if (closed) return 'denied'
    return asWrite(
      attemptMutation(settings, state => {
        const next = change(state.bindings)
        return next === undefined ? undefined : { bindings: next }
      }),
    )
  }
  return {
    path,
    bind(key, secret, configuredAt) {
      if (!isMintedScope(key.scope) || closed) return 'denied'
      return revise(bindings => [
        ...bindings.filter(item => !sameKey(item.key, key)),
        { key, secret, life: 'active', configuredAt },
      ])
    },
    unbind(key) {
      if (!isMintedScope(key.scope) || closed) return 'denied'
      let found = true
      const written = revise(bindings => {
        if (find(bindings, key) === undefined) {
          found = false
          return undefined
        }
        return bindings.filter(item => !sameKey(item.key, key))
      })
      if (written !== 'written') return written
      return found ? 'removed' : 'absent'
    },
    describe(key) {
      if (!isMintedScope(key.scope) || closed) return 'denied'
      const state = current()
      return state === 'unavailable' ? state : presenceOf(find(state.bindings, key))
    },
    list(scope, after, limit) {
      requireIntegerAtLeast(limit, 'limit', 1)
      const start = after === null ? undefined : decodeCursor(after)
      if (!isMintedScope(scope) || closed) return 'denied'
      const state = current()
      if (state === 'unavailable') return state
      const entries: SecretListEntry[] = state.bindings
        .filter(item => sameScope(item.key.scope, scope))
        .sort((left, right) => compareSortKeys(sortKeyOf(left.key), sortKeyOf(right.key)))
        .filter(item => start === undefined || compareSortKeys(sortKeyOf(item.key), start) > 0)
        .slice(0, limit + 1)
        .map(item => ({
          target: item.key.target,
          purpose: item.key.purpose,
          presence: presenceOf(item),
        }))
      const page = entries.slice(0, limit)
      const last = page.at(-1)
      const next =
        entries.length > limit && last !== undefined
          ? encodeCursor([last.target.owner, last.target.key, last.purpose])
          : null
      return { entries: page, next } satisfies SecretListPage
    },
    use(key) {
      if (!isMintedScope(key.scope) || closed) return 'denied'
      const state = current()
      if (state === 'unavailable') return state
      const record = find(state.bindings, key)
      if (record === undefined) return 'missing'
      switch (record.life) {
        case 'active':
          return { kind: 'secret', value: record.secret }
        case 'revoked':
          return 'denied'
        case 'unreadable':
          return 'unavailable'
        default: {
          const unhandled: never = record.life
          throw new Error(`unhandled binding life ${String(unhandled)}`)
        }
      }
    },
    snapshot() {
      if (closed) return 'unavailable'
      const state = current()
      return state === 'unavailable' ? state : { bindings: state.bindings }
    },
    revise,
    close() {
      closed = true
    },
  }
}

/** Opens the vault at `path`. It reads the file once to classify it and never creates or changes it. */
export function openSecretVault(options: SecretVaultOptions): OpenSecretVaultResult {
  const settings = settle(options)
  const refreshed = refresh(settings.path)
  if (refreshed.kind === 'unavailable') return { kind: 'unavailable', cause: refreshed.cause }
  return { kind: 'open', vault: live(settings) }
}

/**
 * Builds the vault when the path is empty, and adopts the vault that is already there otherwise.
 * The decision is made under the lock, so two processes that start on the same empty path cannot
 * each write an empty file over the other's bindings. The seed goes into a built file only.
 */
export function createSecretVault(options: CreateSecretVaultOptions): CreateSecretVaultResult {
  const settings = settle(options)
  const { path } = settings
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    return { kind: 'unavailable', cause: 'io' }
  }
  let release: () => void
  try {
    release = lockAndSweep(path, settings.lock)
  } catch (error: unknown) {
    return error instanceof LockTimeout ? { kind: 'locked' } : { kind: 'unavailable', cause: 'io' }
  }
  try {
    const existing = refresh(path)
    if (existing.kind === 'state') return { kind: 'open', vault: live(settings), created: false }
    if (existing.cause !== 'missing') return { kind: 'unavailable', cause: existing.cause }
    const state: SecretState = {
      bindings: (options.seed ?? []).map(seed => ({
        key: seed.key,
        secret: seed.secret,
        life: 'active',
        configuredAt: seed.configuredAt,
      })),
    }
    const saved = atomicSave(path, state)
    if (!saved.ok) return { kind: saved.phase === 'published' ? 'unconfirmed' : 'not-written' }
    return { kind: 'open', vault: live(settings), created: true }
  } finally {
    release()
  }
}

/** Whether a vault file can be read, or why not. `locked` means the lock wait ran out. */
export type SecretVaultInspection =
  | Readonly<{ kind: 'readable' }>
  | Readonly<{ kind: 'unavailable'; cause: UnavailableCause | 'locked' }>

/**
 * Checks that the file at `path` is a readable vault. It takes the file lock, removes the
 * temporary files that a crashed publish of this vault left behind, and reads the file. It never
 * creates or changes the vault itself. A missing path answers `missing` without a lock.
 */
export function inspectSecretVault(options: SecretVaultOptions): SecretVaultInspection {
  const settings = settle(options)
  const { path } = settings
  try {
    statSync(path)
  } catch (error: unknown) {
    return { kind: 'unavailable', cause: errorCode(error) === 'ENOENT' ? 'missing' : 'io' }
  }
  let release: () => void
  try {
    release = lockAndSweep(path, settings.lock)
  } catch (error: unknown) {
    return { kind: 'unavailable', cause: error instanceof LockTimeout ? 'locked' : 'io' }
  }
  try {
    const refreshed = refresh(path)
    return refreshed.kind === 'state'
      ? { kind: 'readable' }
      : { kind: 'unavailable', cause: refreshed.cause }
  } finally {
    release()
  }
}
