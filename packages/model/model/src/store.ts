import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
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
  const state: CustodianState = { closed: false, factorySecret, bindings: [] }
  mkdirSync(dirname(path), { recursive: true })
  atomicSave(path, state)
  return live(path, state)
}

export function openLocalCustodian(path: string): LocalCustodian | { readonly kind: 'unavailable' } {
  const refreshed = refresh(path, { closed: false, factorySecret: '', bindings: [] })
  if ('kind' in refreshed) return refreshed
  return live(path, refreshed)
}

function live(path: string, initial: CustodianState): LocalCustodian {
  let state = initial
  const notes: Diagnostic[] = []
  const note = (outcome: Resolution['kind'], tenantMatch: boolean) => {
    notes.push({ stage: 'resolve', outcome, tenantMatch })
  }
  return {
    path,
    present(reference) {
      if (state.closed) return { kind: 'denied' }
      const refreshed = refresh(path, state)
      if ('kind' in refreshed) return { kind: 'unavailable' }
      state = refreshed
      return present(state, reference)
    },
    resolve(reference, face) {
      if (state.closed) return { kind: 'denied' }
      const refreshed = refresh(path, state)
      if ('kind' in refreshed) return { kind: 'unavailable' }
      state = refreshed
      const decision = resolve(state, reference, face)
      const binding = state.bindings.find((item) => sameHolder(item, reference))
      note(decision.kind, binding !== undefined)
      return decision
    },
    diagnostics: () => notes,
    put(reference: CredentialReference, secret: string) {
      if (state.closed) return
      const refreshed = refresh(path, state)
      if ('kind' in refreshed) return
      const binding = {
        id: reference.id,
        tenant: reference.tenant,
        purpose: reference.purpose,
        secret,
        life: 'active' as const,
      }
      const next = {
        ...refreshed,
        bindings: [...refreshed.bindings.filter((item) => !sameHolder(item, reference)), binding],
      }
      if (atomicSave(path, next)) state = next
    },
    rotate(reference: CredentialReference, secret: string) {
      if (state.closed) return
      const refreshed = refresh(path, state)
      if ('kind' in refreshed) return
      const next = {
        ...refreshed,
        bindings: refreshed.bindings.map((item) =>
          sameHolder(item, reference) ? { ...item, secret } : item,
        ),
      }
      if (atomicSave(path, next)) state = next
    },
    revoke(reference: CredentialReference) {
      if (state.closed) return
      const refreshed = refresh(path, state)
      if ('kind' in refreshed) return
      const next = {
        ...refreshed,
        bindings: refreshed.bindings.map((item) =>
          sameHolder(item, reference) ? { ...item, life: 'revoked' as const } : item,
        ),
      }
      if (atomicSave(path, next)) state = next
    },
    markUnreadable(reference) {
      if (state.closed) return
      const refreshed = refresh(path, state)
      if ('kind' in refreshed) return
      const next = {
        ...refreshed,
        bindings: refreshed.bindings.map((item) =>
          sameHolder(item, reference) && item.life === 'active' ? { ...item, life: 'unreadable' as const } : item,
        ),
      }
      if (atomicSave(path, next)) state = next
    },
    close() {
      state = { ...state, closed: true }
    },
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
  const tmpPath = `${path}.tmp`
  try {
    writeFileSync(tmpPath, JSON.stringify(storeState(state)))
    renameSync(tmpPath, path)
    return true
  } catch {
    try {
      unlinkSync(tmpPath)
    } catch {
      // Cleanup of the temporary file is best-effort.
    }
    return false
  }
}
