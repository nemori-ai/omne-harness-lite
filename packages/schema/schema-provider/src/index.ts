import type { JsonFailure, JsonRead } from "@omne-harness/json-text"

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
export type NumberProjection = "exact-or-reject" | "lexeme"

/** Structural Standard Schema marker. The provider imports no engine type. */
export type StandardTyped<T> = {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    readonly types?: { readonly input: unknown; readonly output: T } | undefined
  }
}

type DefinitionCommon = {
  readonly origin: "static"
  readonly numbers: NumberProjection
}

/** Code-owned Zod definition. Revision is owner-declared. Content is checked by a structural digest. */
export type ZodDefinition<T> = DefinitionCommon & {
  readonly engine: "zod"
  readonly revision: SchemaRevision
  readonly schema: StandardTyped<T>
}

/**
 * JSON Schema document already in the tagged JSON tree.
 * The provider derives the revision from the canonical document.
 */
export type JsonSchemaDefinition<T> = DefinitionCommon & {
  readonly engine: "json-schema"
  readonly document: Readonly<Record<string, unknown>>
  readonly __type?: T
}

export type SchemaDefinition<T> = ZodDefinition<T> | JsonSchemaDefinition<T>

export function defineSchema<T>(spec: {
  readonly id: string
  readonly load: () => Promise<SchemaDefinition<T>>
}): SchemaRef<T> {
  void spec
  throw new Error("not implemented")
}

export function zodDefinition<S extends StandardTyped<unknown>>(spec: {
  readonly revision: string
  readonly schema: S
  readonly numbers: NumberProjection
}): ZodDefinition<S["~standard"]["types"] extends { readonly output: infer T } ? T : unknown> {
  void spec
  throw new Error("not implemented")
}

export function jsonSchemaDefinition<T>(spec: {
  readonly document: Readonly<Record<string, unknown>>
  readonly numbers: NumberProjection
}): JsonSchemaDefinition<T> {
  void spec
  throw new Error("not implemented")
}

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

export type IssueCode = "type" | "empty" | "precision" | "constraint" | "unrecognized-key"

export type SchemaIssue = {
  readonly path: readonly (string | number)[]
  readonly code: IssueCode
}

export type RefusalReason =
  | "unsupported-construct"
  | "revision-conflict"
  | "budget-exhausted"
  | "attempts-exhausted"
  | "runtime-path-closed"
  | "closed"

export type UnavailableReason = "load-failed" | "compile-failed"

export type CheckPath = "compiled" | "runtime"

/** Result of a check that already holds an admitted snapshot. */
export type SyncVerdict<T> =
  | {
      readonly kind: "valid"
      readonly value: T
      readonly path: CheckPath
      readonly revision: string
    }
  | {
      readonly kind: "invalid"
      readonly issues: readonly [SchemaIssue, ...SchemaIssue[]]
      readonly path: CheckPath
      readonly revision: string
    }
  | { readonly kind: "unreadable"; readonly failure: JsonFailure }

/** Result of `validate`, which may still have to load and compile. */
export type SchemaVerdict<T> =
  | SyncVerdict<T>
  | { readonly kind: "refused"; readonly reason: RefusalReason }
  | {
      readonly kind: "unavailable"
      readonly reason: UnavailableReason
      readonly retryNotBeforeMillis: number
    }
  | { readonly kind: "cancelled" }

export type SchemaLease<T> = {
  readonly revision: string
  readonly superseded: boolean
  check(read: JsonRead): SyncVerdict<T>
  release(): void
  readonly [Symbol.dispose]: () => void
}

export type LeaseOutcome<T> =
  | { readonly kind: "leased"; readonly lease: SchemaLease<T> }
  | { readonly kind: "refused"; readonly reason: RefusalReason }
  | {
      readonly kind: "unavailable"
      readonly reason: UnavailableReason
      readonly retryNotBeforeMillis: number
    }
  | { readonly kind: "cancelled" }

/**
 * Create the cache for one execution domain.
 * Throws `TypeError` when a budget field is missing or out of range.
 * Compiles nothing. Does not import Cordis.
 */
export function createSchemaProvider(budget: SchemaBudget): SchemaProvider {
  void budget
  throw new Error("not implemented")
}

/**
 * Load, admit, compile on first use, and check one `JsonRead`.
 * Concurrent calls for the same key share one in-flight task.
 * `signal` cancels only this caller.
 */
export function validate<T>(
  provider: SchemaProvider,
  schema: SchemaRef<T>,
  read: JsonRead,
  signal?: AbortSignal,
): Promise<SchemaVerdict<T>> {
  void provider
  void schema
  void read
  void signal
  throw new Error("not implemented")
}

/**
 * Hold one admitted snapshot for many synchronous checks.
 * A newer revision does not retarget this lease. `superseded` becomes true.
 * `release` drops the lease. The snapshot stays until its lease count is zero.
 */
export function lease<T>(
  provider: SchemaProvider,
  schema: SchemaRef<T>,
  signal?: AbortSignal,
): Promise<LeaseOutcome<T>> {
  void provider
  void schema
  void signal
  throw new Error("not implemented")
}

/**
 * Ask the provider to call `load` again on the next use of this id.
 * Shape owners call this when they publish a new revision. Request paths do not.
 */
export function refresh(provider: SchemaProvider, id: SchemaId): void {
  void provider
  void id
  throw new Error("not implemented")
}

/**
 * Stop new admission. Checks that already joined finish on the snapshot they joined.
 * A later `validate` or `lease` returns `refused` with reason `closed`.
 * Calling `close` twice leaves the provider closed.
 */
export function close(provider: SchemaProvider): void {
  void provider
  throw new Error("not implemented")
}
