import { z } from 'zod'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const canvasAdoption = describedAdoption({
  owner: '@omne-harness/canvas-tools',
  name: 'canvas-protocol',
  revision: '1',
  changes:
    'One declaration with the command named in the call; who moved a thing comes from the call; the operations of canvas/v1 without the tenant and the canvas.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/canvas-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 262_144,
  maxDepth: 16,
  maxItems: 1024,
  maxMembers: 64,
  maxStringLength: 4096,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('Canvas protocol JSON is not bounded')
  return read.value
}

export const canvasCommandNames = [
  'help',
  'look',
  'away',
  'kinds',
  'place',
  'arrange',
  'take',
  'pile',
  'scatter',
  'lock',
  'unlock',
] as const
export type CanvasCommandName = (typeof canvasCommandNames)[number]

/* The shapes of canvas/v1 without the tenant and the canvas: what is in range is the canvas's to answer. */
const text = z.string()
const count = z.int().min(0)
const positive = z.int().min(1)
const spot = z.strictObject({ x: count, y: count })
const size = z.strictObject({ width: positive, height: positive })
const reference = z.strictObject({ kind: text, ref: text })
const items = z.array(text)

const shapes = {
  help: z.strictObject({ name: z.enum(canvasCommandNames).optional() }),
  look: z.strictObject({}),
  away: z.strictObject({ limit: positive.optional(), before: count.optional() }),
  kinds: z.strictObject({}),
  place: z.strictObject({
    reference,
    at: spot.optional(),
    near: spot.optional(),
    size: size.optional(),
  }),
  arrange: z.strictObject({
    items: z
      .array(
        z.strictObject({
          item: text,
          at: spot.optional(),
          size: size.nullable().optional(),
          top: z.literal(true).optional(),
          pile: text.nullable().optional(),
        }),
      )
      .optional(),
    piles: z
      .array(z.strictObject({ pile: text, at: spot.optional(), name: text.nullable().optional() }))
      .optional(),
  }),
  take: z.strictObject({ items }),
  pile: z.strictObject({ pile: text, items, at: spot.optional() }),
  scatter: z.strictObject({ pile: text }),
  lock: z.strictObject({ items }),
  unlock: z.strictObject({ items }),
} as const satisfies Record<CanvasCommandName, z.ZodType>

export type CanvasArguments = {
  [K in CanvasCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[CanvasCommandName]
export type ArgumentsOf<K extends CanvasCommandName> = Extract<CanvasArguments, { command: K }>

export const canvasSummaries: Readonly<Record<CanvasCommandName, string>> = {
  help: 'Read command usage, and how to make a canvas app.',
  look: 'Read the sheet, every item and pile on it, who last moved each, and the revision.',
  away: 'List the items taken off the canvas, newest first. Pass next as before for the page after.',
  kinds: 'List the kinds that can go on the canvas, each with how its ref is written.',
  place:
    'Put one reference on the canvas: at a spot, near one, or beside the seat of the shape. One already on it is not moved; one taken off comes back.',
  arrange:
    'Change items and piles in one batch: move, resize (size null: its own size), bring to top, into a pile or out (pile null); move or rename a pile.',
  take: 'Take items off the canvas. The things themselves stay where they are.',
  pile: 'Put items into the pile of this id; the pile is made when it is not there.',
  scatter: 'Scatter a pile: its items go to free spots beside it and the pile is gone.',
  lock: 'Lock items: nobody can move, resize, pile or take them until they are unlocked.',
  unlock: 'Unlock items.',
}

/** The contract's values are immutable, which zod writes as `readOnly`: in a schema that means "do not send". */
const sendable = (ctx: { jsonSchema: { readOnly?: boolean } }) => {
  delete ctx.jsonSchema.readOnly
}

export function canvasContract(name: CanvasCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[name], { override: sendable })
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params. A field the command does not have is invalid: it is never dropped silently. */
export function canvasParameterCodec(name: CanvasCommandName): ParameterCodec<CanvasArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: canvasAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shapes[name].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success) {
        const problems = parsed.error.issues.map(({ path, message }) =>
          path.length === 0 ? message : `${path.join('.')}: ${message}`,
        )
        return fail({ kind: 'invalid', reason: problems.join('; ') })
      }
      return succeed({ command: name, params: parsed.data } as CanvasArguments)
    },
  }
}
