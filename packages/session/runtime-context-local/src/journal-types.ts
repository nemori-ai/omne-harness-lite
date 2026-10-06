import type {
  ContextRegistration,
  ContextValue,
  ContextSessionSeed,
} from '@omne-harness-lite/runtime-context'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

export type ContextEvent = {
  readonly codec: 'runtime-context/1'
  readonly scope: SessionScope
  readonly revision: string
  readonly previous: string
} & (
  | { readonly kind: 'session_initialized'; readonly seed: ContextSessionSeed }
  | { readonly kind: 'registered'; readonly registration: ContextRegistration }
  | { readonly kind: 'removed'; readonly key: string }
  | { readonly kind: 'updated'; readonly content: ContextValue }
)
