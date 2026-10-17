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
import {
  loadState,
  present,
  resolve,
  sameHolder,
  storeState,
  type CredentialPort,
  type CredentialReference,
  type CustodianState,
  type Diagnostic,
  type Presence,
  type Resolution,
  type SendFace,
} from './credential.ts'

export type LocalCustodian = CredentialPort & {
  readonly path: string
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
const LOCK_WAIT_TIMEOUT_MS = 30_000

function acquireLockSync(path: string): () => void {
  const start = /* wall-clock: operation-timing -- Measure local lock wait. */ Date.now()
  while (true) {
    try {
      return lockSync(path, { realpath: false, stale: STALE_NEVER_MS, update: LOCK_UPDATE_MS })
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code !== 'ELOCKED') throw error
      if (/* wall-clock: operation-timing -- Measure local lock wait. */ Date.now() - start > LOCK_WAIT_TIMEOUT_MS) {
        throw Object.assign(new Error(`timed out waiting for credential store lock at ${path}`), {
          code: 'ELOCKED',
        })
      }
      // Back off without yielding the event loop, since the public API is sync.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

export function createLocalCustodian(path: string, factorySecret: string): LocalCustodian {
  mkdirSync(dirname(path), { recursive: true })
  const state: CustodianState = { closed: false, factorySecret, bindings: [] }
  const release = acquireLockSync(path)
  try {
    const result = atomicSave(path, state)
    if (!result.ok) {
      if (result.phase === 'published') {
        throw new Error(
          `credential store creation at ${path} confirmation incomplete; verify state before retry`,
        )
      }
      throw new Error(`failed to create credential store at ${path}`)
    }
    return live(path, state)
  } finally {
    release()
  }
}

export function openLocalCustodian(path: string): LocalCustodian | { readonly kind: 'unavailable' } {
  const refreshed = refresh(path, { closed: false, factorySecret: '', bindings: [] })
  if ('kind' in refreshed) return refreshed
  return live(path, refreshed)
}

function live(path: string, initial: CustodianState): LocalCustodian {
  const holder = { state: initial }
  const notes: Diagnostic[] = []
  const note = (outcome: Resolution['kind'], tenantMatch: boolean) => {
    notes.push({ stage: 'resolve', outcome, tenantMatch })
  }
  return {
    path,
    present(reference) {
      if (holder.state.closed || reference.purpose !== 'model-send') return { kind: 'denied' }
      const refreshed = refresh(path, holder.state)
      if ('kind' in refreshed) return { kind: 'unavailable' }
      holder.state = refreshed
      return present(holder.state, reference)
    },
    resolve(reference, face) {
      if (holder.state.closed || !face.authorized || reference.purpose !== 'model-send') return { kind: 'denied' }
      const refreshed = refresh(path, holder.state)
      if ('kind' in refreshed) return { kind: 'unavailable' }
      holder.state = refreshed
      const decision = resolve(holder.state, reference, face)
      const binding = holder.state.bindings.find((item) => sameHolder(item, reference))
      note(decision.kind, binding !== undefined)
      return decision
    },
    diagnostics: () => notes,
    put(reference: CredentialReference, secret: string) {
      mutate(path, holder, (refreshed) => {
        const binding = {
          id: reference.id,
          tenant: reference.tenant,
          purpose: reference.purpose,
          secret,
          life: 'active' as const,
        }
        return {
          ...refreshed,
          bindings: [...refreshed.bindings.filter((item) => !sameHolder(item, reference)), binding],
        }
      })
    },
    rotate(reference: CredentialReference, secret: string) {
      mutate(path, holder, (refreshed) => ({
        ...refreshed,
        bindings: refreshed.bindings.map((item) =>
          sameHolder(item, reference) ? { ...item, secret } : item,
        ),
      }))
    },
    revoke(reference: CredentialReference) {
      mutate(path, holder, (refreshed) => ({
        ...refreshed,
        bindings: refreshed.bindings.map((item) =>
          sameHolder(item, reference) ? { ...item, life: 'revoked' as const } : item,
        ),
      }))
    },
    markUnreadable(reference) {
      mutate(path, holder, (refreshed) => ({
        ...refreshed,
        bindings: refreshed.bindings.map((item) =>
          sameHolder(item, reference) && item.life === 'active'
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

function mutate(
  path: string,
  holder: { state: CustodianState },
  change: (refreshed: CustodianState) => CustodianState,
): void {
  const release = acquireLockSync(path)
  try {
    const refreshed = refresh(path, holder.state)
    if ('kind' in refreshed) throw new Error(`credential store at ${path} is unavailable`)
    const next = change(refreshed)
    const result = atomicSave(path, next)
    if (!result.ok) {
      if (result.phase === 'published') {
        throw new Error(
          `credential store update at ${path} confirmation incomplete; verify state before retry`,
        )
      }
      throw new Error(`failed to update credential store at ${path}`)
    }
    holder.state = next
  } finally {
    release()
  }
}

function refresh(path: string, current: CustodianState): CustodianState | { readonly kind: 'unavailable' } {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { kind: 'unavailable' }
  }
  const loaded = loadState(parsed)
  if (!loaded) return { kind: 'unavailable' }
  // The closed flag is per-process; keep the current process decision.
  return { ...loaded, closed: current.closed }
}

function atomicSave(
  path: string,
  state: CustodianState,
): { readonly ok: true } | { readonly ok: false; readonly phase: 'temp-write' | 'published' } {
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
  } catch {
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
    return { ok: false, phase }
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
