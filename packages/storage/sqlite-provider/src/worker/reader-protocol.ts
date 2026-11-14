import type { JsonValue, MigrationRef } from '@omne-harness/sql-contract'

export type ReaderEnv = Readonly<{
  file: string
  domain: string
  lockWaitMs: number
  generation: number
}>

export type HandlerSpec = Readonly<{
  moduleUrl: string
  codeDigest: string
  readTables: readonly string[]
  requiresMigrations: readonly MigrationRef[]
  maxOutputBytes: number
  maxRowsRead: number
}>

export type ReaderRequest =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'read'; handler: HandlerSpec; input: JsonValue }>
  | Readonly<{ kind: 'close' }>

export type ReaderMessage = Readonly<{
  generation: number
  seq: number
  token: string
  request: ReaderRequest
}>

export type ReaderReply =
  | Readonly<{ kind: 'ready'; scope: string }>
  | Readonly<{ kind: 'open_failed'; diagnostic: string }>
  | Readonly<{ kind: 'read'; output: JsonValue }>
  | Readonly<{ kind: 'schema_unavailable' }>
  | Readonly<{ kind: 'read_limit' }>
  | Readonly<{ kind: 'read_failed'; diagnostic: string; fatal?: boolean }>
  | Readonly<{ kind: 'closed' }>

export type ReaderEnvelope = Readonly<{
  generation: number
  seq: number
  token: string
  reply: ReaderReply
}>
