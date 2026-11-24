import { z } from 'zod'
import {
  canvasIdSchema,
  itemIdSchema,
  pileIdSchema,
  referenceSchema,
  sizeSchema,
  spotSchema,
  type Sheet,
  type Size,
  type SizeRange,
  type Spot,
} from './values.ts'

/** What a request is checked against before anything else: the sheet, the sizes, the length of a batch. */
export type Bounds = Readonly<{
  sheet: Sheet
  size: SizeRange
  batch: number
}>

export type RequestInvalidWhere = 'canvas' | 'request' | 'spot' | 'size' | 'repeated' | 'batch'

/** Answer one of the order: what in the request does not fit, and where in it. */
export type RequestInvalid = Readonly<{
  kind: 'invalid'
  where: RequestInvalidWhere
  path: readonly (string | number)[]
}>

const pileName = z.string().min(1).max(200)

export const placeRequestSchema = z.strictObject({
  canvas: canvasIdSchema,
  reference: referenceSchema,
  at: spotSchema.optional(),
  near: spotSchema.optional(),
  size: sizeSchema.optional(),
})
export type PlaceRequest = z.infer<typeof placeRequestSchema>

export const itemChangeSchema = z
  .strictObject({
    item: itemIdSchema,
    at: spotSchema.optional(),
    size: sizeSchema.nullable().optional(),
    top: z.literal(true).optional(),
    pile: pileIdSchema.nullable().optional(),
  })
  .refine(change => Object.keys(change).length > 1, 'an entry changes nothing')
  .refine(
    change => typeof change.pile !== 'string' || change.at === undefined,
    'in a pile the spot is the pile’s',
  )
export type ItemChange = z.infer<typeof itemChangeSchema>

export const pileChangeSchema = z
  .strictObject({
    pile: pileIdSchema,
    at: spotSchema.optional(),
    name: pileName.nullable().optional(),
  })
  .refine(change => Object.keys(change).length > 1, 'an entry changes nothing')
export type PileChange = z.infer<typeof pileChangeSchema>

export const arrangeRequestSchema = z
  .strictObject({
    canvas: canvasIdSchema,
    items: z.array(itemChangeSchema).default([]),
    piles: z.array(pileChangeSchema).default([]),
  })
  .refine(request => request.items.length + request.piles.length > 0, 'the batch is empty')
export type ArrangeRequest = z.infer<typeof arrangeRequestSchema>

const itemList = z.array(itemIdSchema).min(1)

export const takeRequestSchema = z.strictObject({ canvas: canvasIdSchema, items: itemList })
export type TakeRequest = z.infer<typeof takeRequestSchema>

export const pileRequestSchema = z.strictObject({
  canvas: canvasIdSchema,
  pile: pileIdSchema,
  items: itemList,
  at: spotSchema.optional(),
})
export type PileRequest = z.infer<typeof pileRequestSchema>

export const scatterRequestSchema = z.strictObject({ canvas: canvasIdSchema, pile: pileIdSchema })
export type ScatterRequest = z.infer<typeof scatterRequestSchema>

/** One direction a call: lock them all, or unlock them all. */
export const lockRequestSchema = z.strictObject({
  canvas: canvasIdSchema,
  items: itemList,
  locked: z.boolean(),
})
export type LockRequest = z.infer<typeof lockRequestSchema>

/** The taken records, the newest first; `before` is the `next` of the page before. */
export const lookAwayRequestSchema = z.strictObject({
  canvas: canvasIdSchema,
  limit: z.number().int().min(1).max(1000),
  before: z.number().int().nonnegative().optional(),
})
export type LookAwayRequest = z.infer<typeof lookAwayRequestSchema>

export type Parsed<T> = Readonly<{ ok: T }> | Readonly<{ invalid: RequestInvalid }>

const invalid = (where: RequestInvalidWhere, path: readonly (string | number)[]) => ({
  invalid: { kind: 'invalid' as const, where, path },
})

type Path = readonly (string | number)[]

function shapeOf<T>(schema: z.ZodType<T>, input: unknown): Parsed<T> {
  const parsed = schema.safeParse(input)
  if (parsed.success) return { ok: parsed.data }
  const [first] = parsed.error.issues
  const path = (first?.path ?? []).filter(part => typeof part !== 'symbol')
  return invalid(path[0] === 'canvas' ? 'canvas' : 'request', path)
}

const onSheet = (sheet: Sheet, spot: Spot) => spot.x < sheet.width && spot.y < sheet.height
const sized = (bounds: Bounds, size: Size) =>
  size.width >= bounds.size.min.width &&
  size.height >= bounds.size.min.height &&
  size.width <= bounds.size.max.width &&
  size.height <= bounds.size.max.height

/** The first spot off the sheet, the first size out of bounds, the first identity named twice. */
function checked(
  bounds: Bounds,
  spots: readonly [Path, Spot | undefined][],
  sizes: readonly [Path, Size | null | undefined][],
  names: readonly [Path, string][],
): RequestInvalid | null {
  for (const [path, spot] of spots)
    if (spot !== undefined && !onSheet(bounds.sheet, spot)) return invalid('spot', path).invalid
  for (const [path, size] of sizes)
    if (size != null && !sized(bounds, size)) return invalid('size', path).invalid
  const seen = new Set<string>()
  for (const [path, name] of names) {
    const mark = JSON.stringify([path[0], name])
    if (seen.has(mark)) return invalid('repeated', path).invalid
    seen.add(mark)
  }
  return null
}

function within<T>(
  bounds: Bounds,
  parsed: Parsed<T>,
  batch: number,
  check: (ok: T) => RequestInvalid | null,
): Parsed<T> {
  if ('invalid' in parsed) return parsed
  if (batch > bounds.batch) return invalid('batch', [])
  const broken = check(parsed.ok)
  return broken === null ? parsed : { invalid: broken }
}

export function parsePlace(input: unknown, bounds: Bounds): Parsed<PlaceRequest> {
  const parsed = shapeOf(placeRequestSchema, input)
  return within(bounds, parsed, 1, request =>
    checked(
      bounds,
      [
        [['at'], request.at],
        [['near'], request.near],
      ],
      [[['size'], request.size]],
      [],
    ),
  )
}

export function parseArrange(input: unknown, bounds: Bounds): Parsed<ArrangeRequest> {
  const parsed = shapeOf(arrangeRequestSchema, input)
  const length = 'ok' in parsed ? parsed.ok.items.length + parsed.ok.piles.length : 0
  return within(bounds, parsed, length, ({ items, piles }) =>
    checked(
      bounds,
      [
        ...items.map((change, at): [Path, Spot | undefined] => [['items', at, 'at'], change.at]),
        ...piles.map((change, at): [Path, Spot | undefined] => [['piles', at, 'at'], change.at]),
      ],
      items.map((change, at): [Path, Size | null | undefined] => [
        ['items', at, 'size'],
        change.size,
      ]),
      [
        ...items.map((change, at): [Path, string] => [['items', at, 'item'], change.item]),
        ...piles.map((change, at): [Path, string] => [['piles', at, 'pile'], change.pile]),
      ],
    ),
  )
}

const listed = (items: readonly string[]) =>
  items.map((item, at): [Path, string] => [['items', at], item])

export function parseTake(input: unknown, bounds: Bounds): Parsed<TakeRequest> {
  const parsed = shapeOf(takeRequestSchema, input)
  const length = 'ok' in parsed ? parsed.ok.items.length : 0
  return within(bounds, parsed, length, ({ items }) => checked(bounds, [], [], listed(items)))
}

export function parsePile(input: unknown, bounds: Bounds): Parsed<PileRequest> {
  const parsed = shapeOf(pileRequestSchema, input)
  const length = 'ok' in parsed ? parsed.ok.items.length : 0
  return within(bounds, parsed, length, ({ items, at }) =>
    checked(bounds, [[['at'], at]], [], listed(items)),
  )
}

export function parseScatter(input: unknown): Parsed<ScatterRequest> {
  return shapeOf(scatterRequestSchema, input)
}

export function parseLock(input: unknown, bounds: Bounds): Parsed<LockRequest> {
  const parsed = shapeOf(lockRequestSchema, input)
  const length = 'ok' in parsed ? parsed.ok.items.length : 0
  return within(bounds, parsed, length, ({ items }) => checked(bounds, [], [], listed(items)))
}

export function parseLookAway(input: unknown): Parsed<LookAwayRequest> {
  return shapeOf(lookAwayRequestSchema, input)
}
