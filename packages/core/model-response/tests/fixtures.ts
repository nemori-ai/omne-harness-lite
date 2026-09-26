import { readFileSync } from 'node:fs'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { ModelResponseRejection } from '@omne-harness-lite/model-response'

export function object(value: JsonValue | undefined): JsonObject {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.keys(value).length
  )
    throw new Error('fixture is not an object')
  return value as JsonObject
}
export function parse(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error(`fixture JSON: ${result.failed}`)
  return result.ok
}
const examples = readFileSync(
  new URL(
    '../../../../.meta_harness/design/spec/data/model-response/v1/examples.md',
    import.meta.url,
  ),
  'utf8',
)
const sections = examples.split(/^## 三、/mu)[0]
if (sections === undefined) throw new Error('normative examples missing')
export const normative = [...sections.matchAll(/```json\n([\s\S]*?)\n```/gu)]
  .filter(match => match[1]?.trim().startsWith('{'))
  .map(match => {
    const before = sections.slice(0, match.index)
    const heading = [...before.matchAll(/^### (.+)$/gmu)].at(-1)?.[1]
    if (heading === undefined || match[1] === undefined)
      throw new Error('normative heading missing')
    const rejection = heading.match(/^R-\d+ `([^`]+)`/u)?.[1]
    return {
      id: heading,
      value: object(parse(match[1])),
      rejection: rejection as ModelResponseRejection | undefined,
    }
  })
export function example(id: string): JsonObject {
  const found = normative.find(item => item.value.id === id)
  if (found === undefined) throw new Error(`normative example missing: ${id}`)
  return found.value
}
export const complete = object(normative[0]?.value)
export const failed = example('resp_e6a001')
export const openedFailure = object(normative.find(item => item.id.startsWith('E-5'))?.value)
export const interrupted = object(normative.find(item => item.id.startsWith('E-4'))?.value)
export function omit(value: JsonObject, ...keys: string[]): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))
}
export function text(value: unknown): string {
  return writeJsonLossless(value)
}
export const r30 = object(
  parse(`{${sections.match(/### R-30[\s\S]*?```json\n([\s\S]*?)\n```/u)?.[1] ?? 'invalid'}}`),
).failure
