import { SIZE_TIERS, THEMES, modeOf, type InspectionMode } from '@omne-harness/interface-protocol'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'

export const appViewAdoption = describedAdoption({
  owner: '@omne-harness/interface-tools',
  name: 'app-view-protocol',
  revision: '1',
  changes: 'One command: a page of the app in a mode, as a picture taken where nobody sees it.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/interface-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 65_536,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 1024,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('AppView JSON is not bounded')
  return read.value
}

const shape = z.strictObject({
  page: z
    .string()
    .min(1)
    .describe('The id of the page, as the pages of the app are listed on shell.pages.'),
  subject: z
    .string()
    .min(1)
    .optional()
    .describe('What the page is opened on, as that page reads it.'),
  theme: z.enum(THEMES).optional().describe('light (the default) or dark.'),
  size: z
    .enum(SIZE_TIERS)
    .optional()
    .describe('The text size: medium is the standard one and the default.'),
  skin: z
    .string()
    .min(1)
    .optional()
    .describe('The name of a skin of this tenant; without it the built-in look.'),
  width: z
    .int()
    .optional()
    .describe('Width of the content in pixels, 320 to 2560; 1280 by default.'),
  height: z
    .int()
    .optional()
    .describe('Height of the content in pixels, 240 to 2560; 800 by default.'),
})

export type LookArguments = Readonly<{ command: 'look'; params: z.output<typeof shape> }>

export function lookContract(): ParameterContract {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(shape) as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)

/** A field the command does not have is invalid: it is never dropped silently. */
export function lookParameterCodec(): ParameterCodec<LookArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: appViewAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shape.safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success) {
        const problems = parsed.error.issues.map(({ path, message }) =>
          path.length === 0 ? message : `${path.join('.')}: ${message}`,
        )
        return fail({ kind: 'invalid', reason: problems.join('; ') })
      }
      return succeed({ command: 'look', params: parsed.data })
    },
  }
}

/** The mode the arguments ask for, or bad-mode when anything is out of bounds: such a look is never sent. */
export function modeOfArguments(params: LookArguments['params']): InspectionMode | 'bad-mode' {
  const { theme, size, skin, width, height } = params
  return modeOf({
    ...(theme !== undefined && { theme }),
    ...(size !== undefined && { size }),
    ...(skin !== undefined && { look: { kind: 'skin', name: skin } }),
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
  })
}
