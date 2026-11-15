import type { JsonFailure, JsonRead } from '@omne-harness/json-text'

declare const schemaIdBrand: unique symbol
declare const schemaRevisionBrand: unique symbol

export type SchemaId = string & { readonly [schemaIdBrand]: true }

export type SchemaRevision = string & { readonly [schemaRevisionBrand]: true }

export type SchemaRef<T> = {
  readonly id: SchemaId
  readonly load: () => Promise<SchemaDefinition<T>>
  readonly __type?: T
}

export type NumberProjection = 'exact-or-reject' | 'lexeme'

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

export type ZodDefinition<T> = DefinitionCommon & {
  readonly engine: 'zod'
  readonly revision: SchemaRevision
  readonly schema: StandardTyped<T>
}

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

export type { SchemaProvider } from './provider.ts'

export type SchemaBudget = {
  readonly maxSnapshots: number
  readonly maxConstructDepth: number
  readonly maxConstructNodes: number
  readonly failureBackoffMs: number
  readonly maxAttempts: number
}

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

export type CheckPath = 'compiled' | 'runtime' | 'projection'

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
