import type { Dispatch, DispatchId, SessionRef, TenantId } from '@omne-harness/dispatch-contract'
import type { PortRead } from './ports.ts'

/** A session as the directory of its tenant gives it: its layer, the definition it runs, its permission mode now. */
export type SessionRow = Readonly<{
  session: SessionRef
  depth: number
  archived: boolean
  agent: string
  permission: string
}>

export type SessionToCreate = Readonly<{
  session: SessionRef
  dispatch: Pick<
    Dispatch,
    'id' | 'mode' | 'dispatcher' | 'call' | 'agent' | 'instruction' | 'expectation' | 'context'
  >
  permission: string
}>

export type CreateAnswer =
  | Readonly<{ kind: 'created' }>
  | Readonly<{ kind: 'failed'; detail: string }>
  | Readonly<{ kind: 'unknown' }>

/** Where the run an input started is now. `absent`: the session has no such input. */
export type InputFate =
  | Readonly<{ kind: 'absent' | 'waiting' | 'running' }>
  | Readonly<{ kind: 'ended'; reply: string }>
  | Readonly<{ kind: 'failed' | 'cancelled'; detail: string }>

export type InputToSend = Readonly<{
  to: SessionRef
  input: string
  source: 'dispatch.report' | 'dispatch.message'
  text: string
  from: Readonly<{ session: SessionRef; agent: string | null }>
}>

export type SendAnswer =
  | Readonly<{ kind: 'sent' }>
  | Readonly<{ kind: 'refused'; reason: 'archived' | 'no-such-session' }>
  | Readonly<{ kind: 'unknown' }>

export type CancelAnswer = 'stopped' | 'requested' | 'unknown'

export type Started = Pick<Dispatch, 'id' | 'session'>

/** What this group needs of sessions. Every write goes through a public operation of Session, and doing it again under the same identity recalls it. */
export interface DispatchSessions {
  sessionOf(tenant: TenantId, dispatch: DispatchId): SessionRef
  /** The row of a session of this tenant, or null when the tenant has none of that identity. */
  row(tenant: TenantId, session: SessionRef): Promise<PortRead<SessionRow | null>>
  create(tenant: TenantId, creation: SessionToCreate): Promise<CreateAnswer>
  /** Where the starting input of the session a dispatch created is now. */
  startFate(tenant: TenantId, dispatch: Started): Promise<PortRead<InputFate>>
  send(tenant: TenantId, input: InputToSend): Promise<SendAnswer>
  has(tenant: TenantId, session: SessionRef, input: string): Promise<PortRead<boolean>>
  /** Asks the run the starting input of this session started to stop. */
  cancelStart(tenant: TenantId, dispatch: Started): Promise<CancelAnswer>
}
