import type { FactKey, JsonValue, ParticipatedReply } from './types.ts'

export { packText, unpackText } from './text-pack.ts'

export type SqlValue = null | boolean | number | bigint | string | Uint8Array

export type SqlCell = null | number | bigint | string | Uint8Array

export type QueryRows = Readonly<{
  columns: readonly string[]
  rows: readonly (readonly SqlCell[])[]
  changes: bigint
  lastInsertRowid: bigint | null
}>

export interface ParticipantPort {
  execute(sql: string, params: readonly SqlValue[]): QueryRows
  requireFact(key: FactKey): JsonValue
  provideFact(key: FactKey, value: JsonValue): void
}

export type ParticipantReply =
  | ParticipatedReply
  | Readonly<{ kind: 'conflict'; basis: JsonValue }>
  | Readonly<{ kind: 'unsupported'; basis: JsonValue }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>

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

export interface MigrationModule {
  readonly owner: string
  readonly id: string
  up(port: MigrationPort): void
  verify(port: MigrationPort): MigrationVerdict
}

export interface ReadPort {
  execute(sql: string, params: readonly SqlValue[]): QueryRows
}

export type HandlerOutcome =
  | Readonly<{ kind: 'read'; output: JsonValue }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>

export interface ReadHandlerModule {
  readonly handler: string
  readonly protocol: string
  read(input: JsonValue, port: ReadPort): HandlerOutcome
}
