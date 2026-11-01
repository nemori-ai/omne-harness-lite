// Messages between the control side and one read Worker (SPEC 9.5). One Worker holds one read
// connection. Every message carries the Worker generation, a request number and the lease token of
// the dispatch. The control side accepts a reply only when all three match the request in flight.
import type { JsonValue, MigrationRef } from '@omne-harness/sql-contract'

/** Static data that the read Worker gets at start (workerData). */
export type ReaderEnv = Readonly<{
  file: string
  /** The transaction domain that the file path stands for (SPEC 5.1 item 3). */
  domain: string
  lockWaitMs: number
  /** The Worker generation. The Worker puts it into every reply. */
  generation: number
}>

/** What the Worker needs of a read handler descriptor (SPEC 4.1). */
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
  /** `scope` is the text of the binding row. */
  | Readonly<{ kind: 'ready'; scope: string }>
  | Readonly<{ kind: 'open_failed'; diagnostic: string }>
  | Readonly<{ kind: 'read'; output: JsonValue }>
  | Readonly<{ kind: 'schema_unavailable' }>
  | Readonly<{ kind: 'read_limit' }>
  /** fatal: the cleanup of the connection failed, so the Worker exits after this reply (SPEC 9.5). */
  | Readonly<{ kind: 'read_failed'; diagnostic: string; fatal?: boolean }>
  | Readonly<{ kind: 'closed' }>

export type ReaderEnvelope = Readonly<{
  generation: number
  seq: number
  token: string
  reply: ReaderReply
}>
