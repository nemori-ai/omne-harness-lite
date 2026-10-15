import type { JsonFailure, JsonRead } from '@omne-harness/json-text'

declare const schemaIdBrand: unique symbol
declare const schemaRevisionBrand: unique symbol
declare const providerBrand: unique symbol

/** Stable shape name. One owner per id. Contains no tenant or request data. */
export type SchemaId = string & { readonly [schemaIdBrand]: true }

/** Owner-declared generation name. A new revision is a new snapshot. */
export type SchemaRevision = string & { readonly [schemaRevisionBrand]: true }

/**
 * Lazy handle. Creating it loads nothing and compiles nothing.
 * `load` takes no argument, so the provider cannot pass tenant, request, or authorization data.
 */
export type SchemaRef<T> = {
  readonly id: SchemaId
  readonly load: () => Promise<SchemaDefinition<T>>
  readonly __type?: T
}

/** How a JSON number lexeme is shown to the checker. The shape owner chooses. There is no global default. */
export type NumberProjection = 'exact-or-reject' | 'lexeme'

/** Structural Standard Schema marker. The provider imports no engine type. */
export type StandardTyped<T> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly types?: { readonly input: unknown; readonly output: T } | undefined
  }
}

type DefinitionCommon = {
  readonly origin: 'static'
  readonly numbers: NumberProjection
}

/** Code-owned Zod definition. Revision is owner-declared. Content is checked by a structural digest. */
export type ZodDefinition<T> = DefinitionCommon & {
  readonly engine: 'zod'
  readonly revision: SchemaRevision
  readonly schema: StandardTyped<T>
}

/**
 * JSON Schema document already in the tagged JSON tree.
 * The provider derives the revision from the canonical document.
 */
export type JsonSchemaDefinition<T> = DefinitionCommon & {
  readonly engine: 'json-schema'
  readonly document: Readonly<Record<string, unknown>>
  readonly __type?: T
}

export type SchemaDefinition<T> = ZodDefinition<T> | JsonSchemaDefinition<T>

export {
  close,
  createSchemaProvider,
  defineSchema,
  jsonSchemaDefinition,
  lease,
  refresh,
  validate,
  zodDefinition,
} from './provider.ts'

/**
 * Budget for one execution domain. Every field is required. The module has no default magnitudes.
 * `maxSnapshots` counts resident entries. It is not a byte size.
 */
export type SchemaBudget = {
  readonly maxSnapshots: number
  readonly maxConstructDepth: number
  readonly maxConstructNodes: number
  readonly failureBackoffMs: number
  readonly maxAttempts: number
}

/** One cache owner for one execution domain. Callers cannot construct it. Workers do not share it. */
export type SchemaProvider = { readonly [providerBrand]: true }

export type IssueCode = 'type' | 'empty' | 'precision' | 'constraint' | 'unrecognized-key'

export type SchemaIssue = {
  readonly path: readonly (string | number)[]
  readonly code: IssueCode
}

export type RefusalReason =
  | 'unsupported-construct'
  | 'revision-conflict'
  | 'budget-exhausted'
  | 'attempts-exhausted'
  | 'runtime-path-closed'
  | 'closed'

export type UnavailableReason = 'load-failed' | 'compile-failed'

export type CheckPath = 'compiled' | 'runtime'

/** Result of a check that already holds an admitted snapshot. */
export type SyncVerdict<T> =
  | {
      readonly kind: 'valid'
      readonly value: T
      readonly path: CheckPath
      readonly revision: string
    }
  | {
      readonly kind: 'invalid'
      readonly issues: readonly [SchemaIssue, ...SchemaIssue[]]
      readonly path: CheckPath
      readonly revision: string
    }
  | { readonly kind: 'unreadable'; readonly failure: JsonFailure }

/** Result of `validate`, which may still have to load and compile. */
export type SchemaVerdict<T> =
  | SyncVerdict<T>
  | { readonly kind: 'refused'; readonly reason: RefusalReason }
  | {
      readonly kind: 'unavailable'
      readonly reason: UnavailableReason
      readonly retryNotBeforeMillis: number
    }
  | { readonly kind: 'cancelled' }

export type SchemaLease<T> = {
  readonly revision: string
  readonly superseded: boolean
  check(read: JsonRead): SyncVerdict<T>
  release(): void
  readonly [Symbol.dispose]: () => void
}

export type LeaseOutcome<T> =
  | { readonly kind: 'leased'; readonly lease: SchemaLease<T> }
  | { readonly kind: 'refused'; readonly reason: RefusalReason }
  | {
      readonly kind: 'unavailable'
      readonly reason: UnavailableReason
      readonly retryNotBeforeMillis: number
    }
  | { readonly kind: 'cancelled' }
