import type { ProtocolKey } from './contribution.ts'

/** One operation of a protocol, done inside the server for a person identified earlier. */
export type InProcessCall = Readonly<{
  protocol: ProtocolKey
  operation: string
  /** The body as the operation's contract types it; the entry writes and reads it back at its revision. */
  body: unknown
  login: string
  tenant: string
  /** Stands as the message id: the same id again is recalled by the operation, not done twice. */
  id: string
}>

export type NotExecuted = 'not-mounted' | 'not-offered' | 'conflict' | 'unavailable'

export type InProcessAnswer =
  | Readonly<{ kind: 'answered'; outcome: string; body: unknown }>
  | Readonly<{ kind: 'not-executed'; reason: NotExecuted }>
