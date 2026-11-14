import type { TenantId } from '@omne-harness/legal-identity'
import type { Instant } from '@omne-harness/utc-instant'

export type SecretScope =
  | Readonly<{ layer: 'official' }>
  | Readonly<{ layer: 'tenant'; tenant: TenantId }>

export type SecretTarget = Readonly<{ owner: string; key: string }>

/** The key of one binding. Bindings with different purposes never see each other's secret. */
export type SecretBindingKey = Readonly<{
  scope: SecretScope
  target: SecretTarget
  purpose: string
}>

export type SecretLife = 'active' | 'revoked' | 'unreadable'

export type SecretPresence =
  | Readonly<{ kind: 'unbound' }>
  | Readonly<{ kind: 'bound'; life: SecretLife; configuredAt: Instant | null }>

declare const SECRET_TEXT: unique symbol

export type SecretText = string & { readonly [SECRET_TEXT]: true }

export const SECRET_TEXT_MAX_LENGTH = 4096

export type SecretTextRejection = 'empty' | 'control-character' | 'too-long'

export type SecretTextParse =
  | Readonly<{ ok: true; value: SecretText }>
  | Readonly<{ ok: false; reason: SecretTextRejection }>

export function parseSecretText(raw: string): SecretTextParse {
  const value = raw.trim()
  if (value === '') return { ok: false, reason: 'empty' }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return { ok: false, reason: 'control-character' }
  }
  if (value.length > SECRET_TEXT_MAX_LENGTH) return { ok: false, reason: 'too-long' }
  return { ok: true, value: value as SecretText }
}

export type SecretWriteResult = 'written' | 'not-written' | 'unconfirmed' | 'denied'

export type SecretRemoveResult = 'removed' | 'absent' | 'not-written' | 'unconfirmed' | 'denied'

export type SecretListEntry = Readonly<{
  target: SecretTarget
  purpose: string
  presence: SecretPresence
}>

export type SecretListCursor = Readonly<{ after: string }>

export type SecretListPage = Readonly<{
  entries: readonly SecretListEntry[]
  next: SecretListCursor | null
}>

export interface SecretCustodyManagement {
  bind(key: SecretBindingKey, secret: SecretText, configuredAt: Instant | null): SecretWriteResult
  unbind(key: SecretBindingKey): SecretRemoveResult
  describe(key: SecretBindingKey): SecretPresence | 'denied' | 'unavailable'
  list(
    scope: SecretScope,
    after: SecretListCursor | null,
    limit: number,
  ): SecretListPage | 'denied' | 'unavailable'
}

export interface SecretCustodyUse {
  use(
    key: SecretBindingKey,
  ): Readonly<{ kind: 'secret'; value: SecretText }> | 'missing' | 'denied' | 'unavailable'
}
