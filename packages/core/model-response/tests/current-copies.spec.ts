import { describe, expect, it } from 'vitest'
import responseSchema from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import messagesSchema from '@omne-harness-lite/messages/schema' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import loopSchema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import { LosslessNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'

// MR-1 adopted technical comparison: only four observed annotation keys at Schema
// object positions. Instance-valued const/enum/default and map names stay intact.
const annotations = new Set(['title', 'description', '$comment', 'examples'])
const maps = new Set([
  '$defs',
  'definitions',
  'properties',
  'patternProperties',
  'dependentSchemas',
])
const singles = new Set([
  'additionalProperties',
  'unevaluatedProperties',
  'propertyNames',
  'additionalItems',
  'unevaluatedItems',
  'contains',
  'contentSchema',
  'not',
  'if',
  'then',
  'else',
])
const lists = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
function isObject(value: JsonValue): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function assertionProjection(value: JsonValue): JsonValue {
  if (typeof value === 'boolean') return value
  if (!isObject(value)) throw new Error('copy comparison requires an actual Schema')
  const entries: [string, JsonValue][] = []
  for (const [key, child] of Object.entries(value)) {
    if (annotations.has(key)) continue
    if (maps.has(key)) {
      if (!isObject(child)) throw new Error('invalid Schema map')
      entries.push([
        key,
        Object.fromEntries(
          Object.entries(child).map(([name, item]) => [name, assertionProjection(item)]),
        ),
      ])
    } else if (singles.has(key)) entries.push([key, assertionProjection(child)])
    else if (lists.has(key) || (key === 'items' && Array.isArray(child))) {
      if (!Array.isArray(child)) throw new Error('invalid Schema list')
      entries.push([key, child.map(item => assertionProjection(item))])
    } else if (key === 'items') entries.push([key, assertionProjection(child)])
    else entries.push([key, child])
  }
  return Object.fromEntries(entries)
}

describe('MR9 MR-1 assertion copies without reverse package dependencies', () => {
  for (const name of [
    'ResponseId',
    'SelectedBy',
    'CredentialScope',
    'ParameterAdjustment',
  ] as const)
    it(`messages ${name} has the same full assertion/applicator structure`, () =>
      expect(assertionProjection(messagesSchema.$defs[name])).toEqual(
        assertionProjection(responseSchema.$defs[name]),
      ))
  it('call-accounts ResponseId matches the owning definition', () =>
    expect(assertionProjection(accountsSchema.$defs.ResponseId)).toEqual(
      assertionProjection(responseSchema.$defs.ResponseId),
    ))
  it('messages inline droppedParameters matches Route', () =>
    expect(
      assertionProjection(
        messagesSchema.$defs.ModelCallDispatchedRecord.properties.droppedParameters,
      ),
    ).toEqual(assertionProjection(responseSchema.$defs.Route.properties.droppedParameters)))
  it('messages undispatched cause is exactly the first four Loop cause spellings', () =>
    expect(messagesSchema.$defs.ModelCallEndedRecord.properties.cause.enum).toEqual(
      loopSchema.$defs.FailureCause.enum.slice(0, 4),
    ))
  it('constraint mutation fails alignment', () => {
    const original = responseSchema.$defs.ResponseId
    expect(assertionProjection({ ...original, minLength: 2 })).not.toEqual(
      assertionProjection(original),
    )
    expect(assertionProjection({ ...original, pattern: '.*' })).not.toEqual(
      assertionProjection(original),
    )
    expect(
      assertionProjection({ ...responseSchema.$defs.RunId, $ref: '#/$defs/ResponseId' }),
    ).not.toEqual(assertionProjection(responseSchema.$defs.RunId))
  })
  it('same-named properties map entries remain assertions', () => {
    const original = {
      type: 'object',
      properties: {
        title: { const: 'x' },
        description: { type: 'string' },
        $comment: { const: 1 },
        examples: { type: 'array' },
      },
    }
    const removed = {
      type: 'object',
      properties: {
        description: { type: 'string' },
        $comment: { const: 1 },
        examples: { type: 'array' },
      },
    }
    expect(assertionProjection(original)).not.toEqual(assertionProjection(removed))
    expect(assertionProjection(original)).toEqual(original)
  })
  it('const/enum instance keys and unknown annotations are never deleted', () => {
    const original = {
      const: { title: 'x', description: 'x', $comment: 'x', examples: ['x'] },
      enum: [{ title: 'x' }],
      default: { title: 'x' },
      'x-owned': { title: 'x' },
    }
    expect(assertionProjection(original)).toEqual(original)
    expect(
      assertionProjection({ ...original, const: { ...original.const, title: 'different' } }),
    ).not.toEqual(assertionProjection(original))
    expect(assertionProjection({ ...original, enum: [{ title: 'different' }] })).not.toEqual(
      assertionProjection(original),
    )
    expect(assertionProjection({ ...original, 'x-owned': { title: 'different' } })).not.toEqual(
      assertionProjection(original),
    )
  })
  it('only Schema object annotation values are ignored', () => {
    const original = {
      type: 'object',
      title: 'local explanation',
      properties: { title: { type: 'string', description: 'local explanation' } },
    }
    expect(assertionProjection(original)).toEqual({
      type: 'object',
      properties: { title: { type: 'string' } },
    })
  })
})
