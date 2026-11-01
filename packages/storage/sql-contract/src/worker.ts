// The Worker-side module interfaces of the SQL storage contract. Provider Workers load participant,
// migration and read handler modules that implement these interfaces. Imports no Cordis.
import type { FactKey, JsonValue, ParticipatedReply } from './types.ts'

export type SqlValue = null | boolean | number | bigint | string | Uint8Array

export type SqlCell = null | number | bigint | string | Uint8Array

export type QueryRows = Readonly<{
  columns: readonly string[]
  rows: readonly (readonly SqlCell[])[]
  changes: bigint
  lastInsertRowid: bigint | null
}>

/** Valid only during one execute call of one operation (§7.4). */
export interface ParticipantPort {
  execute(sql: string, params: readonly SqlValue[]): QueryRows
  requireFact(key: FactKey): JsonValue
  provideFact(key: FactKey, value: JsonValue): void
}

/** What a participant module returns. The provider records failed with a category (§7.6). */
export type ParticipantReply =
  | ParticipatedReply
  | Readonly<{ kind: 'conflict'; basis: JsonValue }>
  | Readonly<{ kind: 'unsupported'; basis: JsonValue }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>

/**
 * Default export of a participant module file. execute is synchronous and keeps no mutable
 * state between calls that changes a later result (§7.7.6).
 */
export interface ParticipantModule {
  readonly participant: string
  readonly protocol: string
  execute(facts: Readonly<Record<string, JsonValue>>, port: ParticipantPort): ParticipantReply
}

export interface MigrationPort {
  execute(sql: string, params: readonly SqlValue[]): QueryRows
}

export type MigrationVerdict =
  | Readonly<{ kind: 'verified' }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>

/** Default export of a migration module file (§5.4). */
export interface MigrationModule {
  readonly owner: string
  readonly id: string
  up(port: MigrationPort): void
  verify(port: MigrationPort): MigrationVerdict
}

/** Read-only port: query_only connection and read-only authorizer (§9.4). */
export interface ReadPort {
  execute(sql: string, params: readonly SqlValue[]): QueryRows
}

export type HandlerOutcome =
  | Readonly<{ kind: 'read'; output: JsonValue }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>

/** Default export of a read handler module file (§9.4). */
export interface ReadHandlerModule {
  readonly handler: string
  readonly protocol: string
  read(input: JsonValue, port: ReadPort): HandlerOutcome
}
