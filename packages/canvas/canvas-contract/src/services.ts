import { z } from 'zod'
import type { KindListing } from './kinds.ts'
import { canvasIdSchema, type Canvas, type Mover, type TenantId } from './values.ts'

/**
 * Who acts and for which tenant. A trusted adapter builds it, never a model: the access row for a
 * login, the tool binding for a call. `call` is the tool call this is part of, absent for a person.
 */
export type CallContext = Readonly<{ tenant: TenantId; subject: unknown; call?: string }>

export type AuthorityAnswer = 'allowed' | 'denied' | 'unavailable'

/** Whether this subject may now read or change the canvas of this tenant. Asked at every call. */
export interface CanvasAuthority {
  decide(ctx: CallContext, action: 'read' | 'change'): Promise<AuthorityAnswer>
}

/** Who a call is: the person, or the agent of one session. Null when it cannot be told. */
export interface CanvasMovers {
  moverOf(ctx: CallContext): Promise<Mover | null>
}

/** Where a request does not fit: the canvas it names, or the request as a whole. */
export type InvalidWhere = 'canvas' | 'request'

/** The answers of a read. A basis that cannot be read is never an empty answer. */
export type ReadAnswer<T> =
  | Readonly<{ kind: 'done'; value: T }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable' }>

/** A request that does not fit is answered first, before anyone is asked. */
export type Invalid = Readonly<{ kind: 'invalid'; where: InvalidWhere }>

export type LookAnswer = Invalid | ReadAnswer<Canvas>

export const lookRequestSchema = z.strictObject({ canvas: canvasIdSchema })
export type LookRequest = z.infer<typeof lookRequestSchema>
/** What a caller names. The canvas reads it: a canvas that is not there answers invalid. */
export type LookRequestInput = Readonly<{ canvas: string }>

/** Reads what does not fit as the place it is in; anything but the canvas is the request. */
export function parseLook(
  input: unknown,
): Readonly<{ ok: LookRequest }> | Readonly<{ invalid: InvalidWhere }> {
  const parsed = lookRequestSchema.safeParse(input)
  if (parsed.success) return { ok: parsed.data }
  const onCanvas = parsed.error.issues.every(issue => issue.path[0] === 'canvas')
  return { invalid: onCanvas ? 'canvas' : 'request' }
}

/** The operations of the canvas. People and agents call the same functions. */
export interface CanvasOperations {
  /** The sheet, every item on it, every pile and the revision. */
  look(ctx: CallContext, request: LookRequestInput): Promise<LookAnswer>
  /** The kinds now declared; a name declared twice is listed as a conflict. */
  kinds(ctx: CallContext): Promise<ReadAnswer<readonly KindListing[]>>
}
