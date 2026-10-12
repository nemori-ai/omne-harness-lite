import type {
  ClientLocalState,
  LocalRecord,
  ReplaceOutcome,
} from '@omne-harness-lite/client-local-state'
import type { SessionIdentityObservation } from './session-preparation.ts'

export type TenantLoginOutcome =
  | { readonly kind: 'installed' | 'already-installed' }
  | { readonly kind: 'unconfirmed'; readonly operationId: string }
  | {
      readonly kind: 'blocked'
      readonly reason:
        | 'source-unavailable'
        | 'target-unavailable'
        | 'identity-mismatch'
        | 'selection-changed'
        | 'invalid-input'
    }

type Blocked = Extract<TenantLoginOutcome, { kind: 'blocked' }>
const blocked = (reason: Blocked['reason']): Blocked => ({ kind: 'blocked', reason })
type RecognizedRecord = LocalRecord & { readonly login: NonNullable<LocalRecord['login']> }

function recognizedSource(
  value: LocalRecord | null,
  identity: SessionIdentityObservation,
): value is RecognizedRecord {
  return (
    value !== null &&
    value.center.centerId === identity.centerId &&
    value.login?.accountId === identity.accountId &&
    value.login.handle === identity.loginStateHandle &&
    identity.tenant.account === identity.accountId
  )
}

function targetMismatch(value: LocalRecord | null, identity: SessionIdentityObservation): boolean {
  if (value === null) return false
  if (value.center.centerId !== identity.centerId) return true
  return value.login !== undefined && value.login.accountId !== identity.accountId
}

function sameLogin(value: LocalRecord | null, source: RecognizedRecord): boolean {
  return (
    value?.login?.handle === source.login.handle &&
    value.login.presentation === source.login.presentation &&
    value.login.accountId === source.login.accountId
  )
}

function installed(result: ReplaceOutcome, operationId: string): TenantLoginOutcome {
  switch (result.kind) {
    case 'installed':
      return { kind: 'installed' }
    case 'conflict':
      return blocked('selection-changed')
    case 'unconfirmed':
      return { kind: 'unconfirmed', operationId }
    case 'not-installed':
      return blocked(result.reason === 'invalid-input' ? 'invalid-input' : 'target-unavailable')
  }
}

/** Copy the original login, never issue another one. Both stores remain caller-owned. */
export async function installTenantLogin(
  source: ClientLocalState,
  target: ClientLocalState,
  identity: SessionIdentityObservation,
  operationId: string,
  replacement: 'empty-only' | 'replace-same-account',
): Promise<TenantLoginOutcome> {
  if (operationId.length === 0 || operationId.includes('\0')) return blocked('invalid-input')
  const from = await source.read()
  if (from.kind !== 'read') return blocked('source-unavailable')
  const original = from.snapshot.value
  if (!recognizedSource(original, identity)) return blocked('identity-mismatch')
  const to = await target.read()
  if (to.kind !== 'read') return blocked('target-unavailable')
  const selected = to.snapshot.value
  if (targetMismatch(selected, identity)) return blocked('identity-mismatch')
  if (sameLogin(selected, original)) return { kind: 'already-installed' }
  if (selected?.login !== undefined && replacement !== 'replace-same-account')
    return blocked('selection-changed')
  const value: LocalRecord = {
    center: selected?.center ?? original.center,
    login: original.login,
    cache: [],
  }
  return installed(
    await target.compareAndReplace(to.snapshot.token, value, operationId),
    operationId,
  )
}
