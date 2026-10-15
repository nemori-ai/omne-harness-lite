import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'
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

export function createLocalCustodian(path: string, factorySecret: string): LocalCustodian {
  mkdirSync(dirname(path), { recursive: true })
  const state: CustodianState = { closed: false, factorySecret, bindings: [] }
  const release = acquireLock(lockPath(path))
  try {
    if (!atomicSave(path, state)) throw new Error(`failed to create credential store at ${path}`)
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
  const release = acquireLock(lockPath(path))
  try {
    const refreshed = refresh(path, holder.state)
    if ('kind' in refreshed) throw new Error(`credential store at ${path} is unavailable`)
    const next = change(refreshed)
    if (!atomicSave(path, next)) throw new Error(`failed to update credential store at ${path}`)
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

function atomicSave(path: string, state: CustodianState): boolean {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`
  let fd: number | undefined
  try {
    fd = openSync(tmpPath, 'w')
    writeSync(fd, JSON.stringify(storeState(state)))
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(tmpPath, path)
    // On POSIX, also sync the parent directory so the rename is durable.
    if (process.platform !== 'win32') {
      const dirFd = openSync(dirname(path), 'r')
      try {
        fsyncSync(dirFd)
      } finally {
        closeSync(dirFd)
      }
    }
    return true
  } catch {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // Cleanup of a half-open file descriptor is best-effort.
      }
    }
    try {
      unlinkSync(tmpPath)
    } catch {
      // Cleanup of the temporary file is best-effort.
    }
    return false
  }
}

let tmpCounter = 0

function lockPath(storePath: string): string {
  return `${storePath}.lock`
}

const LOCK_TIMEOUT_MS = Number(process.env.OMNE_CREDENTIAL_LOCK_TIMEOUT_MS ?? '5000')

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function acquireLock(lockPath: string): () => void {
  const start = Date.now()
  while (true) {
    try {
      const fd = openSync(lockPath, 'wx')
      closeSync(fd)
      writeFileSync(lockPath, String(process.pid))
      return () => {
        try {
          unlinkSync(lockPath)
        } catch {
          // Lock release is best-effort; stale locks are reclaimed by PID check.
        }
      }
    } catch {
      // Lock held or race; check whether the owner is still alive.
      try {
        const text = readFileSync(lockPath, 'utf8')
        const pid = Number(text)
        if (Number.isFinite(pid) && !isProcessAlive(pid)) {
          unlinkSync(lockPath)
          continue
        }
      } catch {
        // Lock file may have been released between open and read; retry.
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error(`timed out waiting for credential store lock at ${lockPath}`)
      }
      // Busy-wait backoff for synchronous code paths.
      const deadline = Date.now() + 10
      while (Date.now() < deadline) {
        // spin
      }
    }
  }
}
