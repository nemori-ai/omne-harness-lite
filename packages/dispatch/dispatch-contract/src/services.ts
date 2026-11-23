import { z } from 'zod'
import type { AcceptRefusal } from './accept.ts'
import type { MessageRefusal } from './message.ts'
import type { TransitionRefusal } from './transition.ts'
import {
  TEXT_CEILING,
  modeSchema,
  sessionRefSchema,
  type Dispatch,
  type DispatchId,
  type DispatchState,
  type SessionRef,
  type TenantId,
} from './values.ts'

/** What an operation of this group answers. `unknown`: it is not known whether the facts were written. */
export type Outcome<T, R> =
  | Readonly<{ kind: 'done'; value: T; recalled: boolean }>
  | Readonly<{ kind: 'refused'; reason: R }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export type ParseRefusal = 'invalid-request'

/** Who calls, as a trusted adapter states it. `subject` is the verified principal; a model never builds this. */
export type CallContext = Readonly<{
  tenant: TenantId
  subject: unknown
  session: SessionRef
  /** The message of the session that made this call: a spawn is forked before it. Null where no model step made it. */
  asking: string | null
}>

const text = z.string().min(1).max(TEXT_CEILING)

export const dispatchRequestSchema = z
  .strictObject({
    mode: modeSchema,
    agent: z.string().min(1).max(200),
    instruction: text,
    /** The shape the dispatcher hopes the report has. Handed over and echoed, never checked. */
    expectation: z.string().max(4000).nullable().optional(),
    /** The reference of the dispatching call: the identity of this request, and where its wait is. */
    call: z.string().min(1).max(400),
  })
  .readonly()
export type DispatchRequest = z.infer<typeof dispatchRequestSchema>

export const messageRequestSchema = z
  .strictObject({
    to: sessionRefSchema,
    text,
    id: z.string().min(1).max(200),
  })
  .readonly()
export type MessageRequest = z.infer<typeof messageRequestSchema>

export const reportTextSchema = text

export type MessageSent = Readonly<{ to: SessionRef; input: string }>

export type WithdrawRefusal = TransitionRefusal | 'no-such-dispatch' | 'not-permitted'
export type ReportRefusal = TransitionRefusal | 'not-dispatched' | 'not-permitted'
export type ShowRefusal = 'no-such-dispatch' | 'not-permitted'

export type DispatchQuery = Readonly<{
  by: Readonly<{ dispatcher: SessionRef }> | Readonly<{ sessions: readonly SessionRef[] }>
  states?: readonly DispatchState[]
}>

export interface Dispatching {
  dispatch(
    ctx: CallContext,
    request: z.input<typeof dispatchRequestSchema>,
  ): Promise<Outcome<Dispatch, ParseRefusal | AcceptRefusal>>
  withdraw(ctx: CallContext, id: DispatchId): Promise<Outcome<Dispatch, WithdrawRefusal>>
  report(ctx: CallContext, text: string): Promise<Outcome<Dispatch, ParseRefusal | ReportRefusal>>
  message(
    ctx: CallContext,
    request: z.input<typeof messageRequestSchema>,
  ): Promise<Outcome<MessageSent, ParseRefusal | MessageRefusal>>
  show(ctx: CallContext, id: DispatchId): Promise<Outcome<Dispatch, ShowRefusal>>
  list(
    ctx: CallContext,
    query: DispatchQuery,
  ): Promise<Outcome<readonly Dispatch[], 'not-permitted'>>
}

/** What the provider and the adapters drive: nothing here is asked by an agent. */
export interface DispatchReconciling {
  advance(tenant: TenantId, id: DispatchId): Promise<void>
  reconcile(tenant: TenantId): Promise<'done' | 'unavailable'>
  dispatcherArchived(tenant: TenantId, dispatcher: SessionRef): Promise<'done' | 'unavailable'>
}
