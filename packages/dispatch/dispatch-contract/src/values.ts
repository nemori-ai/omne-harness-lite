import { z } from 'zod'

export const MAX_DISPATCH_DEPTH = 2
export const TEXT_CEILING = 200_000

export const tenantIdSchema = z.string().min(1).max(400).brand<'DispatchTenantId'>()
export type TenantId = z.infer<typeof tenantIdSchema>

/** The identity of a session, as the session directory gives it. This group does not look inside. */
export const sessionRefSchema = z.string().min(1).max(200).brand<'DispatchSessionRef'>()
export type SessionRef = z.infer<typeof sessionRefSchema>

export const dispatchIdSchema = z
  .string()
  .regex(/^dsp_[0-9a-f]{64}$/)
  .brand<'DispatchId'>()
export type DispatchId = z.infer<typeof dispatchIdSchema>

/** A UTC instant with millisecond precision. Two instants compare as strings. */
export const instantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .brand<'DispatchInstant'>()
export type Instant = z.infer<typeof instantSchema>

export const DISPATCH_MODES = ['spawn', 'delegate', 'handoff'] as const
export const modeSchema = z.enum(DISPATCH_MODES)
export type DispatchMode = z.infer<typeof modeSchema>

export const DISPATCH_STATES = [
  'accepted',
  'started',
  'reported',
  'failed',
  'withdrawn',
  'handed-off',
] as const
export const stateSchema = z.enum(DISPATCH_STATES)
export type DispatchState = z.infer<typeof stateSchema>

const text = z.string().min(1).max(TEXT_CEILING)

/** The one report of a dispatch: what the dispatched agent handed back, or its final reply. */
export const reportSchema = z
  .strictObject({ text, origin: z.enum(['report', 'final-reply']) })
  .readonly()
export type Report = z.infer<typeof reportSchema>

export const failureSchema = z
  .strictObject({
    cause: z.enum(['session-not-created', 'run-failed', 'run-cancelled']),
    detail: z.string().max(2000),
  })
  .readonly()
export type DispatchFailure = z.infer<typeof failureSchema>

/** Where the outcome of a dispatch went. Only a report has the input as its second place. */
export const deliverySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('pending') }).readonly(),
  z.strictObject({ kind: z.literal('delivered'), to: z.enum(['result', 'input']) }).readonly(),
  z.strictObject({ kind: z.literal('undeliverable') }).readonly(),
  z.strictObject({ kind: z.literal('wait-closed') }).readonly(),
])
export type Delivery = z.infer<typeof deliverySchema>

export const stopSchema = z.enum(['not-needed', 'requested', 'confirmed'])
export type Stop = z.infer<typeof stopSchema>

export const dispatchSchema = z
  .strictObject({
    id: dispatchIdSchema,
    tenant: tenantIdSchema,
    dispatcher: sessionRefSchema,
    /** The reference of the dispatching call, as its host names it. The wait is found by it. */
    call: z.string().min(1).max(400),
    mode: modeSchema,
    agent: z.string().min(1).max(200),
    instruction: text,
    expectation: z.string().max(4000).nullable(),
    /** The moment of the dispatcher's conversation a spawn copies, as the owner of the copy names it. */
    context: z.string().min(1).max(400).nullable(),
    session: sessionRefSchema,
    state: stateSchema,
    report: reportSchema.nullable(),
    failure: failureSchema.nullable(),
    stop: stopSchema.nullable(),
    delivery: deliverySchema.nullable(),
    acceptedAt: instantSchema,
    changedAt: instantSchema,
  })
  .readonly()
export type Dispatch = z.infer<typeof dispatchSchema>

export const OPEN_STATES: readonly DispatchState[] = ['accepted', 'started']
export const isOpen = (dispatch: Pick<Dispatch, 'state'>): boolean =>
  OPEN_STATES.includes(dispatch.state)
