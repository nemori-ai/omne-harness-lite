import {
  closeSync,
  readdirSync,
  statSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { lockSync } from 'proper-lockfile'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  judgeGate,
  judgePresence,
  judgeQualifiedPresence,
  judgeQualifiedResolution,
  judgeResolution,
  type CustodianState,
} from '@omne-harness/model'
import {
  sameCredentialHolder,
  type CredentialPort,
  type CredentialReference,
  type CredentialResolution,
} from '@omne-harness/model-contract/provider'
import { isIntegerAtLeast, isRecord } from './fields.ts'
import { loadState, storeState, type LocalBinding, type LocalState } from './records.ts'

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

/**
 * The result of a binding write. `written`: the new snapshot is published. `not-written`: the old
 * snapshot is still the one on disk. `unconfirmed`: the new snapshot may be published, but the write
 * could not confirm it; read the binding again before a retry. `denied`: the reference names a
 * tenant that was never minted, or a credential id that another tenant holds, or the custodian is
 * closed; nothing was written.
 */
export type BindingWrite =
  | Readonly<{ kind: 'written' }>
  | Readonly<{ kind: 'not-written' }>
  | Readonly<{ kind: 'unconfirmed' }>
  | Readonly<{ kind: 'denied' }>

/** The result of an unbind: as `BindingWrite`, and `absent` when there was no binding to remove. */
export type BindingRemoval = BindingWrite | Readonly<{ kind: 'absent' }>

/**
 * What the custody shows of one binding. It never shows the secret. `life` is the state of the
 * binding, and `configuredAt` is the instant text of its last bind when the snapshot records it.
 */
export type BindingView =
  | Readonly<{ kind: 'unbound' }>
  | Readonly<{ kind: 'bound'; life: LocalBinding['life']; configuredAt?: string }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

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
  presentFor: NonNullable<CredentialPort['presentFor']>
  resolveFor: NonNullable<CredentialPort['resolveFor']>
  readonly path: string
  diagnostics(): readonly Diagnostic[]
  put(reference: CredentialReference, secret: string): void
  rotate(reference: CredentialReference, secret: string): void
  /** Replaces the factory secret. Bindings, their secrets and their lives stay as they are. */
  replaceFactorySecret(secret: string): void
  revoke(reference: CredentialReference): void
  /**
   * Binds the secret to the reference, or replaces the secret and the time of the existing binding.
   * The binding is active afterwards. A store failure is a result, not a throw.
   */
  bind(
    input: Readonly<{ reference: CredentialReference; secret: string; configuredAt: string }>,
  ): BindingWrite
  /** Removes the binding. Afterwards the tenant has no such binding, as if it never had one. */
  unbind(input: Readonly<{ reference: CredentialReference }>): BindingRemoval
  /** Shows the binding without its secret, read from disk now. */
  describe(input: Readonly<{ reference: CredentialReference }>): BindingView
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
  const release = lockAndSweep(path, settings.lock)
  try {
    const existing = refresh(path, { closed: false })
    if (existing.kind === 'state') return live(settings, existing.state)
    if (existing.cause !== 'missing') {
      throw new Error(`credential store at ${path} exists but is ${existing.cause}; not replaced`, {
        cause: existing.error,
      })
    }
    const state: LocalState = {
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

/** Whether a vault file can be read, or why not. `locked` means the lock wait ran out. */
export type VaultInspection =
  | Readonly<{ kind: 'readable' }>
  | Readonly<{ kind: 'unavailable'; cause: UnavailableCause | 'locked' }>

/**
 * Checks that the file at `path` is a readable vault. It takes the file lock, removes the temporary
 * files that a crashed publish of this vault left behind, and reads the file. It never creates or
 * changes the vault itself. The path must already hold something: a missing path answers `missing`
 * without a lock.
 */
export function inspectLocalCustodian(options: CustodianOptions): VaultInspection {
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
    return { kind: 'unavailable', cause: errorCode(error) === 'ELOCKED' ? 'locked' : 'io' }
  }
  try {
    const refreshed = refresh(path, { closed: false })
    return refreshed.kind === 'state'
      ? { kind: 'readable' }
      : { kind: 'unavailable', cause: refreshed.cause }
  } finally {
    release()
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
function lockAndSweep(path: string, lock: Required<LockOptions>): () => void {
  const release = acquireLockSync(path, lock)
  sweepTemporaries(path)
  return release
}

export function openLocalCustodian(options: CustodianOptions): OpenResult {
  const settings = settle(options)
  const refreshed = refresh(settings.path, { closed: false })
  if (refreshed.kind === 'unavailable') return { kind: 'unavailable', cause: refreshed.cause }
  return { kind: 'open', custodian: live(settings, refreshed.state) }
}

function live(settings: Settings, initial: LocalState): LocalCustodian {
  const { path } = settings
  const holder = { state: initial }
  const notes: Diagnostic[] = []
  const note = (entry: Diagnostic) => {
    notes.push(entry)
    if (notes.length > settings.diagnosticsCapacity) notes.shift()
  }
  // The gate denials come from the judgment and need no snapshot, so they are answered before
  // the disk is read; an unreadable store still denies what it would never have served.
  const current = (): LocalState | undefined => {
    const refreshed = refresh(path, holder.state)
    if (refreshed.kind === 'unavailable') {
      note({ stage: 'refresh', cause: refreshed.cause })
      return undefined
    }
    holder.state = refreshed.state
    return holder.state
  }
  // The one entry of every judgment: the gate first, then the snapshot from disk, and only then
  // the judgment over it. An unreadable store answers `unavailable` after the gate passed.
  const judged = <R>(
    reference: Parameters<typeof judgeGate>[1],
    judge: (state: LocalState) => R,
    face?: Parameters<typeof judgeGate>[2],
  ) => {
    const gate = judgeGate(holder.state, reference, face)
    if (gate) return gate
    const state = current()
    return state ? judge(state) : ({ kind: 'unavailable' } as const)
  }
  const noteResolve = (
    state: LocalState,
    reference: Parameters<typeof sameCredentialHolder>[1],
    decision: CredentialResolution,
  ) => {
    const binding = state.bindings.find(item => sameCredentialHolder(item, reference))
    const answer = withoutEmptyFactory(decision)
    note({ stage: 'resolve', outcome: answer.kind, tenantMatch: binding !== undefined })
    return answer
  }
  // A management operation must never serve a reference whose id another tenant holds.
  const heldElsewhere = (state: LocalState, reference: CredentialReference): boolean =>
    state.bindings.some(item => item.id === reference.id && !sameCredentialHolder(item, reference))
  return {
    path,
    present: reference => judged(reference, state => judgePresence(state, reference)),
    resolve: (reference, face) =>
      judged(
        reference,
        state => noteResolve(state, reference, judgeResolution(state, reference, face)),
        face,
      ),
    presentFor(input) {
      const reference = { id: input.id, tenant: input.access.tenant, purpose: input.purpose }
      return judged(reference, state => judgeQualifiedPresence(state, input))
    },
    resolveFor(input) {
      const reference = { id: input.id, tenant: input.access.tenant, purpose: input.purpose }
      return judged(reference, state =>
        noteResolve(state, reference, judgeQualifiedResolution(state, input)),
      )
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
    replaceFactorySecret(secret: string) {
      mutate(settings, holder, refreshed => ({ ...refreshed, factorySecret: secret }))
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
    bind({ reference, secret, configuredAt }) {
      if (!isMinted(reference) || holder.state.closed) return { kind: 'denied' }
      let refused = false
      const written = tryMutate(settings, holder, refreshed => {
        if (heldElsewhere(refreshed, reference)) {
          refused = true
          return undefined
        }
        const binding: LocalBinding = {
          id: reference.id,
          tenant: reference.tenant,
          purpose: reference.purpose,
          secret,
          life: 'active',
          configuredAt,
        }
        return {
          ...refreshed,
          bindings: [
            ...refreshed.bindings.filter(item => !sameCredentialHolder(item, reference)),
            binding,
          ],
        }
      })
      return refused ? { kind: 'denied' } : written
    },
    unbind({ reference }) {
      if (!isMinted(reference) || holder.state.closed) return { kind: 'denied' }
      let found: 'denied' | 'absent' | undefined
      const written = tryMutate(settings, holder, refreshed => {
        if (heldElsewhere(refreshed, reference)) found = 'denied'
        else if (!refreshed.bindings.some(item => sameCredentialHolder(item, reference)))
          found = 'absent'
        if (found !== undefined) return undefined
        return {
          ...refreshed,
          bindings: refreshed.bindings.filter(item => !sameCredentialHolder(item, reference)),
        }
      })
      if (found !== undefined && written.kind === 'written') return { kind: found }
      return written
    },
    describe({ reference }) {
      if (!isMinted(reference) || holder.state.closed) return { kind: 'denied' }
      const state = current()
      if (state === undefined) return { kind: 'unavailable' }
      if (heldElsewhere(state, reference)) return { kind: 'denied' }
      const binding = state.bindings.find(item => sameCredentialHolder(item, reference))
      if (binding === undefined) return { kind: 'unbound' }
      return {
        kind: 'bound',
        life: binding.life,
        ...(binding.configuredAt === undefined ? {} : { configuredAt: binding.configuredAt }),
      }
    },
    close() {
      holder.state = { ...holder.state, closed: true }
    },
  }
}

/**
 * The deployment default applies only where the deployment really provides one. An empty factory
 * secret is no credential: the custody answers `absent`, so no send starts with it.
 */
function withoutEmptyFactory(decision: CredentialResolution): CredentialResolution {
  return decision.kind === 'value' && decision.scope === 'factory' && decision.value === ''
    ? { kind: 'absent' }
    : decision
}

function isMinted(reference: CredentialReference): boolean {
  return tenantEquals(reference.tenant, reference.tenant)
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

type Mutation =
  | Readonly<{ kind: 'written' }>
  | Readonly<{ kind: 'not-written'; error: Error }>
  | Readonly<{ kind: 'unconfirmed'; error: Error }>

/**
 * One locked read, change and write. `change` answers `undefined` to write nothing; the result is
 * then `written` and the snapshot on disk stays as it was. A failure before the new snapshot
 * replaced the old one is `not-written`; a failure after that is `unconfirmed`.
 */
function attemptMutation(
  settings: Settings,
  holder: { state: LocalState },
  change: (refreshed: LocalState) => LocalState | undefined,
): Mutation {
  const { path } = settings
  let release: () => void
  try {
    release = lockAndSweep(path, settings.lock)
  } catch (error: unknown) {
    // The lock error keeps its own code (`ELOCKED` on a timeout) for the throwing operations.
    if (error instanceof Error) return { kind: 'not-written', error }
    const message = `credential store lock at ${path} was not taken`
    return { kind: 'not-written', error: new Error(message, { cause: error }) }
  }
  try {
    const refreshed = refresh(path, holder.state)
    if (refreshed.kind === 'unavailable') {
      const message = `credential store at ${path} is unavailable: ${refreshed.cause}`
      return { kind: 'not-written', error: new Error(message, { cause: refreshed.error }) }
    }
    const next = change(refreshed.state)
    if (next === undefined) {
      holder.state = refreshed.state
      return { kind: 'written' }
    }
    const result = atomicSave(path, next)
    if (!result.ok) {
      if (result.phase === 'published') {
        const message = `credential store update at ${path} confirmation incomplete; verify state before retry`
        return { kind: 'unconfirmed', error: new Error(message, { cause: result.cause }) }
      }
      const message = `failed to update credential store at ${path}`
      return { kind: 'not-written', error: new Error(message, { cause: result.cause }) }
    }
    holder.state = next
    return { kind: 'written' }
  } finally {
    release()
  }
}

/** A binding write for the management results: the kind only, never the error behind it. */
function tryMutate(
  settings: Settings,
  holder: { state: LocalState },
  change: (refreshed: LocalState) => LocalState | undefined,
): BindingWrite {
  return { kind: attemptMutation(settings, holder, change).kind }
}

function mutate(
  settings: Settings,
  holder: { state: LocalState },
  change: (refreshed: LocalState) => LocalState,
): void {
  const mutation = attemptMutation(settings, holder, change)
  if (mutation.kind !== 'written') throw mutation.error
}

// The closed cause set is what the public results carry; the error behind it travels with the
// result so that the management operations can throw it as their `cause`.
type Refreshed =
  | Readonly<{ kind: 'state'; state: LocalState }>
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
  state: LocalState,
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
