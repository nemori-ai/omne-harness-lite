import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type {
  ContextMutation,
  ContextRead,
  ContextReader,
  ContextRegistration,
  ContextScope,
  ContextValue,
} from './runtime-context.ts'

/** Trusted session construction data. This does not grant initialization authority. */
export interface ContextSessionSeed {
  readonly required: readonly ContextRegistration[]
  readonly initial: readonly ContextValue[]
  readonly fixed: readonly { readonly key: string; readonly value: JsonValue }[]
}

/** A private bootstrap port, deliberately absent from RuntimeContextService. */
export interface ContextSessionInitializer {
  readonly initializeContextSession: (
    scope: ContextScope,
    seed: ContextSessionSeed,
  ) => Promise<ContextMutation>
}

/** Readable registration metadata. Source configuration requires configure authority. */
export interface ContextVisibleRegistration {
  readonly key: string
  readonly required: boolean
  readonly recovery: ContextRegistration['recovery']
}

declare const cursorBrand: unique symbol
/** Owned by one bound reader. Serialization and a cast cannot restore its validity. */
export interface ContextCursor {
  readonly [cursorBrand]: true
}

export interface ContextSnapshot {
  /** Visible projection only; never a management or content CAS revision. */
  readonly viewRevision: string
  readonly registrations: readonly ContextVisibleRegistration[]
  readonly values: readonly ContextValue[]
  readonly cursor: ContextCursor
}

export interface ContextChangedValue {
  readonly registration: ContextVisibleRegistration
  readonly value: ContextValue
}

export type ContextObservationFailure = Extract<ContextRead, { kind: 'rejected' }>

/** Full observation is separate from a tool's durable, selected-key read dependency. */
export interface ContextSnapshotReader extends ContextReader {
  readonly snapshot: () => Promise<
    { readonly kind: 'snapshot'; readonly snapshot: ContextSnapshot } | ContextObservationFailure
  >
  readonly changes: (cursor: ContextCursor) => Promise<
    | {
        readonly kind: 'changes'
        /** Visible projection only; never a management or content CAS revision. */
        readonly viewRevision: string
        readonly added: readonly ContextChangedValue[]
        readonly updated: readonly ContextChangedValue[]
        readonly removed: readonly string[]
        readonly cursor: ContextCursor
      }
    | { readonly kind: 'resetRequired' }
    | ContextObservationFailure
  >
}

export interface ContextSourceHandle {
  readonly generation: string
  /** Withdraws immediately; resolves after this generation's admitted work settles. */
  readonly dispose: () => Promise<void>
  /** A scope/key wake hint from this source generation; never a content write. */
  readonly invalidate: (
    scope: ContextScope,
    keys: readonly string[],
  ) => Promise<{ readonly kind: 'invalidated' } | ContextObservationFailure>
}
