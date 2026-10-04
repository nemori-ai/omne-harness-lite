import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'

export type ContextScope = SessionScope
export type ContextConsumer = 'model' | 'tool' | 'extension'
export interface ContextRegistration {
  /** A session attribute key, not a new global block identity. */
  readonly key: string
  readonly source: string
  readonly config: JsonValue
  readonly consumers: readonly ContextConsumer[]
  readonly required: boolean
  readonly recovery: 'persisted' | 'reread_source' | 'recompute'
}
export interface ContextValue {
  readonly key: string
  readonly revision: string
  readonly value: JsonValue
  readonly observedAt: string
}
export type ContextRead =
  | { readonly kind: 'values'; readonly values: readonly ContextValue[] }
  | { readonly kind: 'rejected'; readonly reason: 'invalidInput' | 'notAuthorized' | 'missingRegistration' | 'sourceUnavailable' | 'ownerStopped' | 'unavailable' }
/** Trusted construction binds scope and consumer. read() cannot select a different role. */
export interface ContextReader {
  readonly read: (keys: readonly string[]) => Promise<ContextRead>
}
export type RegistrationRead =
  | { readonly kind: 'registrations'; readonly revision: string; readonly entries: readonly ContextRegistration[] }
  | { readonly kind: 'rejected'; readonly reason: 'invalidInput' | 'notAuthorized' | 'ownerStopped' | 'sourceUnavailable' | 'unavailable' }
export interface ContextSource {
  readonly name: string
  readonly consumers: readonly ContextConsumer[]
  /** Trusted source declaration, checked against the session's meta registration policy. */
  readonly requiredKeys: readonly string[]
  readonly recovery: ContextRegistration['recovery']
  readonly read: (scope: ContextScope, config: JsonValue) => Promise<ContextRead>
}
export interface ContextSourceRegistrations {
  /** The disposer removes only this registration generation, not session registrations. */
  readonly registerSource: (source: ContextSource) => () => void
}
export type ContextMutation =
  | { readonly kind: 'applied'; readonly revision: string }
  | { readonly kind: 'rejected'; readonly reason: 'notAuthorized' | 'requiredRegistration' | 'revisionConflict' | 'sourceUnavailable' | 'ownerStopped' | 'invalidInput' | 'unavailable' }
export type ContextAccess = SessionAccess
export type ContextBinding = { readonly kind: 'bound'; readonly reader: ContextReader } | Extract<ContextRead, {kind: 'rejected'}>
export interface RuntimeContextOperations {
  /** consumer is checked against the live identity; it never grants a role. */
  readonly bind: (access: ContextAccess, scope: ContextScope, consumer: ContextConsumer) => Promise<ContextBinding>
  readonly registrations: (access: ContextAccess, scope: ContextScope) => Promise<RegistrationRead>
  readonly register: (access: ContextAccess, scope: ContextScope, value: ContextRegistration, expectedRevision: string) => Promise<ContextMutation>
  readonly update: (access: ContextAccess, scope: ContextScope, value: { readonly key: string; readonly value: JsonValue }, expectedRevision: string) => Promise<ContextMutation>
  readonly remove: (access: ContextAccess, scope: ContextScope, key: string, expectedRevision: string) => Promise<ContextMutation>
}
