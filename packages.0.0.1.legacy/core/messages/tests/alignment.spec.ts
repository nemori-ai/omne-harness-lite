import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  type JsonValue,
  type JsonObject,
  LosslessNumber,
} from '@omne-harness-lite/content-blocks'

function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function object(value: JsonValue | undefined): JsonObject {
  if (!isObject(value)) throw new Error('expected Schema object')
  return value
}
function schema(path: string): JsonObject {
  const read = readJsonStrict(readFileSync(new URL(path, import.meta.url), 'utf8'))
  if ('failed' in read) throw new Error('Schema is invalid JSON')
  return object(read.ok)
}
function path(source: JsonObject, parts: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = source
  for (const key of parts) current = object(current)[key]
  return current
}
/** Only documentation annotations differ between these frozen copies. Assertion values stay literal. */
function assertions(value: JsonValue | undefined): unknown {
  if (value === undefined) throw new Error('missing alignment source')
  if (Array.isArray(value)) return value.map(assertions)
  if (value !== null && typeof value === 'object' && !LosslessNumber.is(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['title', 'description', '$comment', 'examples'].includes(key))
        .map(([key, item]) => [key, assertions(item)]),
    )
  return value
}
const messages = schema('../schema/messages.v2.schema.json')
const response = schema('fixtures/response-alignment.schema.json')
const loop = schema('../../loop-extension/schema/loop-extension.v2.schema.json')
describe('V12 six literal frozen definition alignments without reverse product dependencies', () => {
  for (const name of ['ResponseId', 'SelectedBy', 'CredentialScope', 'ParameterAdjustment'])
    it(name, () => {
      expect(assertions(path(messages, ['$defs', name]))).toEqual(
        assertions(path(response, ['$defs', name])),
      )
    })
  it('dispatched.droppedParameters and Route.droppedParameters inline shapes', () => {
    expect(
      assertions(
        path(messages, ['$defs', 'ModelCallDispatchedRecord', 'properties', 'droppedParameters']),
      ),
    ).toEqual(assertions(path(response, ['$defs', 'Route', 'properties', 'droppedParameters'])))
  })
  it('model_call_ended.cause equals the first four loop FailureCause tokens in order', () => {
    const causes = path(loop, ['$defs', 'FailureCause', 'enum'])
    if (!Array.isArray(causes)) throw new Error('missing loop cause enum')
    expect(
      path(messages, ['$defs', 'ModelCallEndedRecord', 'properties', 'cause', 'enum']),
    ).toEqual(causes.slice(0, 4))
  })
})

const currentMessages = schema('../schema/messages.schema.json')
const currentResponse = schema('../../model-response/schema/model-response.schema.json')
describe('M8-V5 MR11 owns the aligned no-cycle representations', () => {
  for (const name of ['ResponseId', 'SelectedBy', 'CredentialScope', 'ParameterAdjustment'])
    it(name, () => {
      expect(assertions(path(currentMessages, ['$defs', name]))).toEqual(
        assertions(path(currentResponse, ['$defs', name])),
      )
    })
  it('dropped parameter representations remain exact', () => {
    expect(
      assertions(
        path(currentMessages, [
          '$defs',
          'ModelCallDispatchedRecord',
          'properties',
          'droppedParameters',
        ]),
      ),
    ).toEqual(
      assertions(path(currentResponse, ['$defs', 'Route', 'properties', 'droppedParameters'])),
    )
  })
})
