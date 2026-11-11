// Secret custody (SPEC「秘密设置项」): the binding key, what a read face may show, the two narrow
// ports and the one boundary that turns outside text into a secret. This file has no I/O. The
// local file provider is settings-local's `./secrets` entry; the trusted consumers are the
// Settings secret-item commands, the Tool credential provider and the Model credential adapter.
import type { TenantId } from '@omne-harness/legal-identity'
import type { Instant } from '@omne-harness/utc-instant'

/**
 * Whose secret a binding is: the official (deployment) layer, or one minted tenant. An
 * organization scope does not exist until there is a legal write path for it.
 */
export type SecretScope =
  | Readonly<{ layer: 'official' }>
  | Readonly<{ layer: 'tenant'; tenant: TenantId }>

/** What a secret belongs to: the owning capability and its key within that owner. */
export type SecretTarget = Readonly<{ owner: string; key: string }>

/** The key of one binding. Bindings with different purposes never see each other's secret. */
export type SecretBindingKey = Readonly<{
  scope: SecretScope
  target: SecretTarget
  purpose: string
}>

/** The life of a bound secret. Only an `active` one is served to the use face. */
export type SecretLife = 'active' | 'revoked' | 'unreadable'

/**
 * What a read face shows of a binding: whether it is there, its life and when it was configured.
 * It has no value member, so no read face can return the secret.
 */
export type SecretPresence =
  | Readonly<{ kind: 'unbound' }>
  | Readonly<{ kind: 'bound'; life: SecretLife; configuredAt: Instant | null }>

declare const SECRET_TEXT: unique symbol

/** A secret as text. Only `parseSecretText` makes one. */
export type SecretText = string & { readonly [SECRET_TEXT]: true }

/** The longest secret text, after the whitespace around it is removed. */
export const SECRET_TEXT_MAX_LENGTH = 4096

export type SecretTextRejection = 'empty' | 'control-character' | 'too-long'

export type SecretTextParse =
  | Readonly<{ ok: true; value: SecretText }>
  | Readonly<{ ok: false; reason: SecretTextRejection }>

/**
 * The one boundary from outside text to a secret: the whitespace around the text is removed; what
 * stays must be non-empty, free of control characters (C0 and DEL) and within the length limit.
 * The rejection names the rule, never the text.
 */
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

/**
 * The result of a write. `written`: the new state is published. `not-written`: the old state is
 * still the one on disk. `unconfirmed`: the new state may be published, but the write could not
 * confirm it; describe the binding before a retry. `denied`: the key names a scope that was never
 * minted, or the custody is closed; nothing was written.
 */
export type SecretWriteResult = 'written' | 'not-written' | 'unconfirmed' | 'denied'

/** The result of a removal: as a write, and `absent` when there was no binding to remove. */
export type SecretRemoveResult = 'removed' | 'absent' | 'not-written' | 'unconfirmed' | 'denied'

export type SecretListEntry = Readonly<{
  target: SecretTarget
  purpose: string
  presence: SecretPresence
}>

/** Where a list continues. Opaque and serializable; a cursor from another scope is refused. */
export type SecretListCursor = Readonly<{ after: string }>

export type SecretListPage = Readonly<{
  entries: readonly SecretListEntry[]
  next: SecretListCursor | null
}>

/**
 * The management face: write, remove, describe and list. For the Settings secret-item commands
 * and trusted deployment operations. No member returns a secret.
 */
export interface SecretCustodyManagement {
  /**
   * Binds the secret to the key, or replaces the secret and the time of the existing binding; the
   * binding is active afterwards. `configuredAt` is the caller's instant, or `null` when the caller
   * has none. Binding the same value again is `written`.
   */
  bind(key: SecretBindingKey, secret: SecretText, configuredAt: Instant | null): SecretWriteResult
  unbind(key: SecretBindingKey): SecretRemoveResult
  /** Reads the binding now. The custody keeps no cache of what it answered before. */
  describe(key: SecretBindingKey): SecretPresence | 'denied' | 'unavailable'
  /** The bindings of one scope, in a stable order, `limit` at a time. */
  list(
    scope: SecretScope,
    after: SecretListCursor | null,
    limit: number,
  ): SecretListPage | 'denied' | 'unavailable'
}

/**
 * The use face: one secret for exactly one key, read at the moment of use. Only consumers that
 * the assembly trusts receive it. `missing` is no active binding for this key; the custody never
 * answers with another scope, target or purpose. Synchronous: the Model send fence resolves
 * credentials synchronously.
 */
export interface SecretCustodyUse {
  use(
    key: SecretBindingKey,
  ): Readonly<{ kind: 'secret'; value: SecretText }> | 'missing' | 'denied' | 'unavailable'
}
