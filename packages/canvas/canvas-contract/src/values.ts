import { z } from 'zod'

export const tenantIdSchema = z.string().min(1).max(200).brand<'CanvasTenantId'>()
export type TenantId = z.infer<typeof tenantIdSchema>

/** Each tenant has one canvas, `main`. The identity is in every operation so that more can come without a new shape. */
export const MAIN_CANVAS = 'main'
export const canvasIdSchema = z.literal(MAIN_CANVAS)
export type CanvasId = z.infer<typeof canvasIdSchema>

export const itemIdSchema = z.string().min(1).max(64).brand<'CanvasItemId'>()
export type ItemId = z.infer<typeof itemIdSchema>

export const pileIdSchema = z.string().min(1).max(64).brand<'CanvasPileId'>()
export type PileId = z.infer<typeof pileIdSchema>

/** The name of a kind, `<domain>.<name>`: the key of the point `canvas.kinds`. */
export const kindNameSchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/)
  .brand<'CanvasKindName'>()
export type KindName = z.infer<typeof kindNameSchema>

/** A UTC instant with millisecond precision. Two instants compare as strings. */
export const instantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => {
    const time = Date.parse(value)
    return !Number.isNaN(time) && new Date(time).toISOString() === value
  })
  .brand<'CanvasInstant'>()
export type Instant = z.infer<typeof instantSchema>

/** What is on the canvas: a pair of opaque texts. The canvas does not read either. */
export const referenceSchema = z
  .strictObject({ kind: z.string().min(1).max(64), ref: z.string().min(1).max(1024) })
  .readonly()
export type Reference = z.infer<typeof referenceSchema>

const coordinate = z.number().int().nonnegative()
const extent = z.number().int().positive()

/** A point on the sheet; the origin is its top left corner. */
export const spotSchema = z.strictObject({ x: coordinate, y: coordinate }).readonly()
export type Spot = z.infer<typeof spotSchema>

export const sizeSchema = z.strictObject({ width: extent, height: extent }).readonly()
export type Size = z.infer<typeof sizeSchema>

/** Who last changed an arrangement: the person, or the agent of one session. Nothing is done by the system. */
export const moverSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('human') }).readonly(),
  z.strictObject({ kind: z.literal('agent'), session: z.string().min(1).max(200) }).readonly(),
])
export type Mover = z.infer<typeof moverSchema>

/**
 * One record of the canvas. A taken item (`off`) keeps the spot it had, is in no pile and is not
 * locked. `size` null: the drawing's own size.
 */
export const itemSchema = z
  .strictObject({
    id: itemIdSchema,
    reference: referenceSchema,
    state: z.enum(['on', 'off']),
    at: spotSchema,
    size: sizeSchema.nullable(),
    rank: z.number().int().nonnegative(),
    pile: pileIdSchema.nullable(),
    locked: z.boolean(),
    by: moverSchema,
    when: instantSchema,
  })
  .readonly()
export type Item = z.infer<typeof itemSchema>

export const pileSchema = z
  .strictObject({
    id: pileIdSchema,
    name: z.string().min(1).max(200).nullable(),
    at: spotSchema,
    by: moverSchema,
    when: instantSchema,
  })
  .readonly()
export type Pile = z.infer<typeof pileSchema>

/** The edges of the sheet and the step of its grid, as configured. */
export const sheetSchema = z
  .strictObject({ width: extent, height: extent, grid: extent })
  .readonly()
export type Sheet = z.infer<typeof sheetSchema>

/** The canvas as it is read: the sheet, every item on it, every pile, and the revision. */
export type Canvas = Readonly<{
  sheet: Sheet
  items: readonly Item[]
  piles: readonly Pile[]
  revision: number
}>
