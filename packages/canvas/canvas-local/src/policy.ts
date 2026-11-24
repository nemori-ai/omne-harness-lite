import { sheetSchema, sizeSchema } from '@omne-harness/canvas-contract'
import { z } from 'zod'

const positive = z.number().int().positive()

/** Every value the provider runs on. There are no silent defaults: a missing or invalid value refuses to load. */
export const canvasPolicySchema = z
  .strictObject({
    /** The edges of the sheet and the step of its grid. */
    sheet: sheetSchema,
    /** How many items may be on the sheet, how many taken ones are kept, how many a batch may name. */
    limits: z.strictObject({ placed: positive, away: positive, batch: positive }),
    /** The least and the most an item may be sized to. */
    size: z.strictObject({ min: sizeSchema, max: sizeSchema }),
    /** The room an item without a size is counted to take when a free spot is looked for. */
    footprint: sizeSchema,
    /** How long the owner of a kind may take to answer admit. */
    admitTimeoutMs: positive,
  })
  .superRefine((policy, issues) => {
    const { sheet, size, footprint } = policy
    const fits = (inner: { width: number; height: number }, outer: typeof inner) =>
      inner.width <= outer.width && inner.height <= outer.height
    const broken: [boolean, string[], string][] = [
      [
        sheet.grid <= Math.min(sheet.width, sheet.height),
        ['sheet', 'grid'],
        'the grid is larger than the sheet',
      ],
      [fits(size.min, size.max), ['size'], 'the least size is above the most'],
      [fits(size.max, sheet), ['size', 'max'], 'the most size does not fit the sheet'],
      [
        fits(size.min, footprint) && fits(footprint, size.max),
        ['footprint'],
        'the footprint is outside the sizes',
      ],
    ]
    for (const [holds, path, message] of broken)
      if (!holds) issues.addIssue({ code: 'custom', path, message })
  })

export type CanvasPolicy = z.infer<typeof canvasPolicySchema>

export class CanvasPolicyError extends Error {
  constructor(issues: string) {
    super(`The canvas policy is missing or invalid: ${issues}`)
    this.name = 'CanvasPolicyError'
  }
}

export function parsePolicy(input: unknown): CanvasPolicy {
  const parsed = canvasPolicySchema.safeParse(input)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
  throw new CanvasPolicyError(issues.join('; '))
}
