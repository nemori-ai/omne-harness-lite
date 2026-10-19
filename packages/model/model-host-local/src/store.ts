import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { lockSync } from 'proper-lockfile'
import { tenantEquals } from '@omne-harness/legal-identity'
import { judgeGate, judgePresence, judgeResolution, type CustodianState } from '@omne-harness/model'
import {
  sameCredentialHolder,
  type CredentialPort,
  type CredentialReference,
  type CredentialResolution,
} from '@omne-harness/model-contract'
import { isIntegerAtLeast, isRecord } from './fields.ts'
import { loadState, storeState } from './records.ts'

/** Why a store file cannot be read: absent, not a valid snapshot, or a file-system error. */
export type UnavailableCause = 'missing' | 'corrupt' | 'io'

export type Diagnostic =
  | Readonly<{ stage: 'resolve'; outcome: CredentialResolution['kind']; tenantMatch: boolean }>
  | Readonly<{ stage: 'refresh'; cause: UnavailableCause }>

export type LockOptions = Readonly<{
  /** How long a writer waits for the file lock before it gives up. */
  waitMs?: number
  /** The pause between two attempts to take the lock. */
  backoffMs?: number
}>

export type CustodianOptions = Readonly<{
  path: string
  lock?: LockOptions
  /** How many of the most recent diagnostics a handle keeps. */
  diagnosticsCapacity?: number
}>

export type CreateOptions = CustodianOptions & Readonly<{ factorySecret: string }>

export type OpenResult =
  | Readonly<{ kind: 'open'; custodian: LocalCustodian }>
  | Readonly<{ kind: 'unavailable'; cause: UnavailableCause }>

type Settings = Readonly<{
  path: string
  lock: Required<LockOptions>
  diagnosticsCapacity: number
}>

const DEFAULT_LOCK: Required<LockOptions> = { waitMs: 30_000, backoffMs: 50 }
const DEFAULT_DIAGNOSTICS_CAPACITY = 256

// Only an absent option takes its default. A caller outside the type system can hand in `null`,
// `NaN` or a string; `NaN` would make the lock wait endless and the diagnostics ring unbounded, so
// every settled value is checked before the lock is taken or the disk is read.
function settle(options: CustodianOptions): Settings {
  const lock = settleLock(options.lock)
  const diagnosticsCapacity = requireIntegerAtLeast(
    orDefault(options.diagnosticsCapacity, DEFAULT_DIAGNOSTICS_CAPACITY),
    'diagnosticsCapacity',
    1,
  )
  return { path: options.path, lock, diagnosticsCapacity }
}

function settleLock(given: LockOptions | undefined): Required<LockOptions> {
  if (given === undefined) return DEFAULT_LOCK
  if (!isRecord(given)) throw new TypeError(`lock must be an object, got ${String(given)}`)
  return {
    waitMs: requireIntegerAtLeast(orDefault(given.waitMs, DEFAULT_LOCK.waitMs), 'lock.waitMs', 0),
    backoffMs: requireIntegerAtLeast(
      orDefault(given.backoffMs, DEFAULT_LOCK.backoffMs),
      'lock.backoffMs',
      0,
    ),
  }
}

function orDefault(value: unknown, fallback: number): unknown {
  return value === undefined ? fallback : value
}

function requireIntegerAtLeast(value: unknown, name: string, minimum: number): number {
  if (!isIntegerAtLeast(value, minimum)) {
    throw new TypeError(`${name} must be an integer of at least ${minimum}, got ${String(value)}`)
  }
  return value
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined
}

export type LocalCustodian = CredentialPort & {
  readonly path: string
  diagnostics(): readonly Diagnostic[]
  put(reference: CredentialReference, secret: string): void
  rotate(reference: CredentialReference, secret: string): void
  revoke(reference: CredentialReference): void
  markUnreadable(reference: CredentialReference): void
  close(): void
}

// Disable proper-lockfile's time-based takeover by setting `stale` to the
// largest safe integer. With this value no finite clock jump can make a live
// holder's lock appear stale, so another writer cannot steal it. We still
// periodically update the lockfile mtime within Node's timer limit to keep the
// library's internal bookkeeping happy. Crash recovery is manual: a leftover
// `${path}.lock` means the owning process died and must be removed by an
// operator after all writers are stopped.
const STALE_NEVER_MS = Number.MAX_SAFE_INTEGER
const LOCK_UPDATE_MS = 2 ** 31 - 1

function acquireLockSync(path: string, lock: Required<LockOptions>): () => void {
  const deadline =
    /* wall-clock: operation-timing -- Measure local lock wait. */ Date.now() + lock.waitMs
  while (true) {
    try {
      return lockSync(path, { realpath: false, stale: STALE_NEVER_MS, update: LOCK_UPDATE_MS })
    } catch (error: unknown) {
      if (errorCode(error) !== 'ELOCKED') throw error
      const remaining =
        deadline - /* wall-clock: operation-timing -- Measure local lock wait. */ Date.now()
      if (remaining <= 0) {
        throw Object.assign(new Error(`timed out waiting for credential store lock at ${path}`), {
          code: 'ELOCKED',
          cause: error,
        })
      }
      // Back off without yielding the event loop, since the public API is sync. A pause never runs
      // past the deadline, so `waitMs` stays the upper bound even when `backoffMs` is larger.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        Math.min(lock.backoffMs, remaining),
      )
    }
  }
}

/**
 * Creates the store when the path is empty, and adopts the store that is already there otherwise.
 * The decision is made under the lock, so two processes that start on the same empty path cannot
 * each write an empty snapshot over the other's bindings.
 */
export function createLocalCustodian(options: CreateOptions): LocalCustodian {
  const settings = settle(options)
  const { path } = settings
  mkdirSync(dirname(path), { recursive: true })
  const release = acquireLockSync(path, settings.lock)
  try {
    const existing = refresh(path, { closed: false })
    if (existing.kind === 'state') return live(settings, existing.state)
    if (existing.cause !== 'missing') {
      throw new Error(`credential store at ${path} exists but is ${existing.cause}; not replaced`, {
        cause: existing.error,
      })
    }
    const state: CustodianState = {
      closed: false,
      factorySecret: options.factorySecret,
      bindings: [],
    }
    const result = atomicSave(path, state)
    if (!result.ok) {
      if (result.phase === 'published') {
        throw new Error(
          `credential store creation at ${path} confirmation incomplete; verify state before retry`,
          { cause: result.cause },
        )
      }
      throw new Error(`failed to create credential store at ${path}`, { cause: result.cause })
    }
    return live(settings, state)
  } finally {
    release()
  }
}

export function openLocalCustodian(options: CustodianOptions): OpenResult {
  const settings = settle(options)
  const refreshed = refresh(settings.path, { closed: false })
  if (refreshed.kind === 'unavailable') return { kind: 'unavailable', cause: refreshed.cause }
  return { kind: 'open', custodian: live(settings, refreshed.state) }
}

function live(settings: Settings, initial: CustodianState): LocalCustodian {
  const { path } = settings
  const holder = { state: initial }
  const notes: Diagnostic[] = []
  const note = (entry: Diagnostic) => {
    notes.push(entry)
    if (notes.length > settings.diagnosticsCapacity) notes.shift()
  }
  // The gate denials come from the judgment and need no snapshot, so they are answered before
  // the disk is read; an unreadable store still denies what it would never have served.
  const current = (): CustodianState | undefined => {
    const refreshed = refresh(path, holder.state)
    if (refreshed.kind === 'unavailable') {
      note({ stage: 'refresh', cause: refreshed.cause })
      return undefined
    }
    holder.state = refreshed.state
    return holder.state
  }
  return {
    path,
    present(reference) {
      const gate = judgeGate(holder.state, reference)
      if (gate) return gate
      const state = current()
      if (!state) return { kind: 'unavailable' }
      return judgePresence(state, reference)
    },
    resolve(reference, face) {
      const gate = judgeGate(holder.state, reference, face)
      if (gate) return gate
      const state = current()
      if (!state) return { kind: 'unavailable' }
      const decision = judgeResolution(state, reference, face)
      const binding = state.bindings.find(item => sameCredentialHolder(item, reference))
      note({ stage: 'resolve', outcome: decision.kind, tenantMatch: binding !== undefined })
      return decision
    },
    diagnostics: () => notes.slice(),
    put(reference: CredentialReference, secret: string) {
      requireMintedTenant(reference)
      mutate(settings, holder, refreshed => {
        const binding = {
          id: reference.id,
          tenant: reference.tenant,
          purpose: reference.purpose,
          secret,
          life: 'active' as const,
        }
        return {
          ...refreshed,
          bindings: [
            ...refreshed.bindings.filter(item => !sameCredentialHolder(item, reference)),
            binding,
          ],
        }
      })
    },
    rotate(reference: CredentialReference, secret: string) {
      requireMintedTenant(reference)
      mutate(settings, holder, refreshed => ({
        ...refreshed,
        bindings: refreshed.bindings.map(item =>
          sameCredentialHolder(item, reference) ? { ...item, secret } : item,
        ),
      }))
    },
    revoke(reference: CredentialReference) {
      requireMintedTenant(reference)
      mutate(settings, holder, refreshed => ({
        ...refreshed,
        bindings: refreshed.bindings.map(item =>
          sameCredentialHolder(item, reference) ? { ...item, life: 'revoked' as const } : item,
        ),
      }))
    },
    markUnreadable(reference) {
      requireMintedTenant(reference)
      mutate(settings, holder, refreshed => ({
        ...refreshed,
        bindings: refreshed.bindings.map(item =>
          sameCredentialHolder(item, reference) && item.life === 'active'
            ? { ...item, life: 'unreadable' as const }
            : item,
        ),
      }))
    },
    close() {
      holder.state = { ...holder.state, closed: true }
    },
  }
}

// Equality with itself holds only for a minted tenant. A copied tenant matches no stored row, so a
// management operation on it would either do nothing or, for `put`, write a row under the real
// tenant's name on the next read, which re-mints it from text. Every management operation refuses
// it before it takes the lock or reads the file.
function requireMintedTenant(reference: CredentialReference): void {
  if (!tenantEquals(reference.tenant, reference.tenant)) {
    throw new Error('credential binding tenant was never minted; nothing was written')
  }
}

function mutate(
  settings: Settings,
  holder: { state: CustodianState },
  change: (refreshed: CustodianState) => CustodianState,
): void {
  const { path } = settings
  const release = acquireLockSync(path, settings.lock)
  try {
    const refreshed = refresh(path, holder.state)
    if (refreshed.kind === 'unavailable') {
      throw new Error(`credential store at ${path} is unavailable: ${refreshed.cause}`, {
        cause: refreshed.error,
      })
    }
    const next = change(refreshed.state)
    const result = atomicSave(path, next)
    if (!result.ok) {
      if (result.phase === 'published') {
        throw new Error(
          `credential store update at ${path} confirmation incomplete; verify state before retry`,
          { cause: result.cause },
        )
      }
      throw new Error(`failed to update credential store at ${path}`, { cause: result.cause })
    }
    holder.state = next
  } finally {
    release()
  }
}

// The closed cause set is what the public results carry; the error behind it travels with the
// result so that the management operations can throw it as their `cause`.
type Refreshed =
  | Readonly<{ kind: 'state'; state: CustodianState }>
  | Readonly<{ kind: 'unavailable'; cause: UnavailableCause; error: unknown }>

function refresh(path: string, current: Pick<CustodianState, 'closed'>): Refreshed {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error: unknown) {
    return { kind: 'unavailable', cause: errorCode(error) === 'ENOENT' ? 'missing' : 'io', error }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error: unknown) {
    return { kind: 'unavailable', cause: 'corrupt', error }
  }
  const loaded = loadState(parsed)
  if (!loaded) {
    return {
      kind: 'unavailable',
      cause: 'corrupt',
      error: new TypeError(`the file at ${path} is not a credential store snapshot`),
    }
  }
  // The closed flag is per-process; keep the current process decision.
  return { kind: 'state', state: { ...loaded, closed: current.closed } }
}

function atomicSave(
  path: string,
  state: CustodianState,
):
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; phase: 'temp-write' | 'published'; cause: unknown }> {
  const tmpPath = `${path}.${process.pid}.${/* wall-clock: internal-name -- Name a temporary store file. */ Date.now()}.${tmpCounter++}.tmp`
  let fd: number | undefined
  // 'published' means the main file has already been replaced; failures after
  // that point leave the new state potentially visible and must be verified.
  let phase: 'temp-write' | 'published' = 'temp-write'
  try {
    fd = openSync(tmpPath, 'w')
    writeAll(fd, JSON.stringify(storeState(state)))
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(tmpPath, path)
    phase = 'published'
    // On POSIX, also sync the parent directory so the rename is durable.
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
    // Always attempt to remove our own unique temporary file. If the rename
    // already happened, the temporary file no longer exists and unlink fails
    // safely; otherwise we clean up the partial snapshot.
    try {
      unlinkSync(tmpPath)
    } catch {
      // Cleanup of the temporary file is best-effort.
    }
    return { ok: false, phase, cause: error }
  }
}

function writeAll(fd: number, data: string): void {
  const buffer = Buffer.from(data)
  let offset = 0
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset)
    if (written === 0) throw new Error('file write made no progress')
    offset += written
  }
}

let tmpCounter = 0
