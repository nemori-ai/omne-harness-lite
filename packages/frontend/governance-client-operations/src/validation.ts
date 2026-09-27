import { createRequire } from 'node:module'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type {
  ActionInput,
  ActionIntent,
  ActionPreview,
  ActionReport,
  PromptResult,
} from './surface.ts'

const require = createRequire(import.meta.url)
const cg: { readonly $id: string } = require('../schema/governance-client-operations.schema.json')
const oe: { readonly $id: string } = require('@omne-harness-lite/offer-expiry/schema')
const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  strictRequired: false,
  validateFormats: false,
})
ajv.addKeyword('x-counterexamples')
ajv.addSchema(require('@omne-harness-lite/identity-values/schema'))
ajv.addSchema(oe)
ajv.addSchema(require('@omne-harness-lite/governance-center-client/schema'))
ajv.addSchema(cg)
const cg2: {
  readonly $id: string
} = require('../schema/governance-client-operations-v2.schema.json')
ajv.addSchema(cg2)
const intentSchema = ajv.compile({ $ref: `${cg2.$id}#/$defs/Intent` })
const previewSchema = ajv.compile({ $ref: `${cg2.$id}#/$defs/Preview` })
const promptSchema = ajv.compile({ $ref: `${cg2.$id}#/$defs/PromptExchange` })
const inputSchema = ajv.compile({ $ref: `${cg.$id}#/$defs/Input` })
const outputSchema = ajv.compile({ $ref: `${cg.$id}#/$defs/Output` })
const instantSchema = ajv.compile({ $ref: `${oe.$id}#/$defs/Instant` })

function capture<T>(input: unknown, valid: (value: unknown) => boolean): T | undefined {
  let text: string | undefined
  try {
    text = JSON.stringify(input)
  } catch {
    return undefined
  }
  if (text === undefined) return undefined
  const copy: unknown = JSON.parse(text)
  try {
    if (!valid(input) || !valid(copy)) return undefined
  } catch {
    return undefined
  }
  return freeze(copy) as T
}
export function captureAction(input: unknown): ActionInput | undefined {
  return capture<ActionInput>(input, inputSchema)
}
export function captureIntent(input: unknown): ActionIntent | undefined {
  return capture<ActionIntent>(input, intentSchema)
}
export function capturePrompt(intent: ActionIntent, result: unknown): PromptResult | undefined {
  return capture<{ intent: ActionIntent; result: PromptResult }>({ intent, result }, promptSchema)
    ?.result
}
export function validPreview(value: unknown): value is ActionPreview {
  return previewSchema(value)
}
export function validReport(value: unknown): boolean {
  return outputSchema(value)
}
export function validInstant(value: unknown): value is string {
  return instantSchema(value)
}
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item)
    Object.freeze(value)
  }
  return value
}
/** Values are already captured JSON; this is structural equality, not identity normalization. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
