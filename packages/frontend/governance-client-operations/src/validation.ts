import { createRequire } from 'node:module'
import type {
  ActionInput,
  ActionIntent,
  ActionPreview,
  ActionReport,
  PromptResult,
} from './surface.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
function fixedSchemas() {
  return require('./generated/ordinary.cjs') as Record<
    'Intent' | 'Preview' | 'PromptExchange' | 'Input' | 'Output' | 'Instant',
    (value: unknown) => boolean
  >
}
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
  return capture<ActionInput>(input, fixedSchemas().Input)
}
export function captureIntent(input: unknown): ActionIntent | undefined {
  return capture<ActionIntent>(input, fixedSchemas().Intent)
}
export function capturePrompt(intent: ActionIntent, result: unknown): PromptResult | undefined {
  return capture<{ intent: ActionIntent; result: PromptResult }>(
    { intent, result },
    fixedSchemas().PromptExchange,
  )?.result
}
export function validPreview(value: unknown): value is ActionPreview {
  return fixedSchemas().Preview(value)
}
export function validReport(value: unknown): boolean {
  return fixedSchemas().Output(value)
}
export function validInstant(value: unknown): value is string {
  return fixedSchemas().Instant(value)
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
