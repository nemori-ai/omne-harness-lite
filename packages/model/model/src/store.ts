import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  loadState,
  present,
  resolve,
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
  writeFileSync(path, JSON.stringify(storeState(state)))
  return live(path, state)
}

export function openLocalCustodian(path: string): LocalCustodian | { readonly kind: 'unavailable' } {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { kind: 'unavailable' }
  }
  const state = loadState(parsed)
  if (!state) return { kind: 'unavailable' }
  return live(path, state)
}

function live(path: string, initial: CustodianState): LocalCustodian {
  let state = initial
  const notes: Diagnostic[] = []
  const note = (outcome: Resolution['kind'], tenantMatch: boolean) => {
    notes.push({ stage: 'resolve', outcome, tenantMatch })
  }
  const save = () => {
    writeFileSync(path, JSON.stringify(storeState(state)))
  }
  return {
    path,
    present(reference) {
      return present(state, reference)
    },
    resolve(reference, face) {
      const decision = resolve(state, reference, face)
      const binding = state.bindings.find((item) => item.id === reference.id)
      note(decision.kind, Boolean(binding && tenantEquals(binding.tenant, reference.tenant)))
      return decision
    },
    diagnostics: () => notes,
    put(reference: CredentialReference, secret: string) {
      const binding = {
        id: reference.id,
        tenant: reference.tenant,
        purpose: reference.purpose,
        secret,
        revoked: false,
        unreadable: false,
      }
      state = {
        ...state,
        bindings: [...state.bindings.filter((item) => item.id !== reference.id), binding],
      }
      save()
    },
    rotate(reference: CredentialReference, secret: string) {
      state = {
        ...state,
        bindings: state.bindings.map((item) =>
          item.id === reference.id ? { ...item, secret } : item,
        ),
      }
      save()
    },
    revoke(reference: CredentialReference) {
      state = {
        ...state,
        bindings: state.bindings.map((item) =>
          item.id === reference.id ? { ...item, revoked: true } : item,
        ),
      }
      save()
    },
    markUnreadable(reference) {
      state = {
        ...state,
        bindings: state.bindings.map((item) =>
          item.id === reference.id ? { ...item, unreadable: true } : item,
        ),
      }
      save()
    },
    close() {
      state = { ...state, closed: true }
      save()
    },
  }
}
