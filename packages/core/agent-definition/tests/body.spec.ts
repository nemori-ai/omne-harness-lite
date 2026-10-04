import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import schema from '@omne-harness-lite/agent-definition/schema' with { type: 'json' }
import { extractAgentDefinitionInputs, judgeAgentDefinitionBody } from '../src/index.ts'

const normative = new URL(
  '../../../../.meta_harness/design/spec/data/agent-definition/v1/',
  import.meta.url,
)
const examples = readFileSync(new URL('examples.md', normative), 'utf8')
function parsed(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error(`fixture failed: ${result.failed}`)
  return result.ok
}
function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function object(value: JsonValue | undefined): JsonObject {
  if (!isObject(value)) throw new Error('fixture is not an object')
  return value
}
const bodies = [...examples.matchAll(/```json\n([\s\S]*?)\n```/gu)].map(match => {
  if (match[1] === undefined) throw new Error('missing fixture')
  return object(parsed(match[1]))
})
function body(index: number): JsonObject {
  return object(bodies[index])
}
function edit(
  value: JsonValue,
  path: readonly (string | number)[],
  replacement: JsonValue,
): JsonValue {
  const [head, ...tail] = path
  if (head === undefined) return replacement
  if (typeof head === 'number') {
    if (!Array.isArray(value) || value[head] === undefined)
      throw new Error('bad array fixture path')
    return value.map((entry, index) => (index === head ? edit(entry, tail, replacement) : entry))
  }
  const source = object(value)
  const entry = source[head]
  if (entry === undefined) throw new Error('bad object fixture path')
  return { ...source, [head]: edit(entry, tail, replacement) }
}
function remove(value: JsonValue, key: string): JsonObject {
  return Object.fromEntries(Object.entries(object(value)).filter(([name]) => name !== key))
}
function references(value: JsonObject): readonly JsonValue[] {
  if (!Array.isArray(value.references)) throw new Error('missing fixture references')
  return value.references
}
function attributes(value: JsonObject): readonly JsonValue[] {
  if (!Array.isArray(value.attributes)) throw new Error('missing fixture attributes')
  return value.attributes
}

describe('normative body and immutable extraction', () => {
  test.each([0, 1])('frozen normative E-%s', index => {
    expect(judgeAgentDefinitionBody(body(index))).toEqual({ ok: true })
    expect(extractAgentDefinitionInputs(body(index))).toEqual({
      ok: { references: body(index).references, attributes: body(index).attributes },
    })
  })

  test('unknown numbers and original body survive lossless round-trip', () => {
    const original = body(0)
    const before = writeJsonLossless(original)
    expect(extractAgentDefinitionInputs(original)).toEqual({
      ok: { references: [], attributes: [] },
    })
    const roundTrip = parsed(writeJsonLossless(original))
    expect(writeJsonLossless(roundTrip)).toBe(before)
    expect(before).toContain('9007199254740993')
    expect(before).toContain('0.10000000000000000001')
  })

  test('owned arrays keep order and absent resident without adding defaults', () => {
    const source = {
      references: [
        { capability: { category: 'tool', name: 'example:b' } },
        { capability: { category: 'tool', name: 'example:a' }, resident: false },
      ],
      attributes: [attributes(body(1))[2]],
    }
    const value = parsed(writeJsonLossless(source))
    const result = extractAgentDefinitionInputs(value)
    expect(result).toEqual({ ok: source })
    if (!('ok' in result)) throw new Error('valid fixture rejected')
    expect(result.ok.references).not.toBe(object(value).references)
    expect(Object.isFrozen(result.ok.references)).toBe(true)
    expect(Object.isFrozen(result.ok.references[0])).toBe(true)
    source.references.reverse()
    expect(result.ok.references.map(ref => ref.capability.name)).toEqual(['example:b', 'example:a'])
    expect(result.ok.attributes).toHaveLength(1)
    expect(result.ok.references[0]).not.toHaveProperty('resident')
  })

  test('domain object member order does not change value', () => {
    const domain = object(object(attributes(body(1))[0]).domain)
    expect(
      judgeAgentDefinitionBody(
        edit(body(1), ['attributes', 0, 'domain'], {
          schema: domain.schema ?? null,
          kind: domain.kind ?? null,
        }),
      ),
    ).toEqual({ ok: true })
  })

  test('huge positive duration has no implicit Number or scheduler bound', () => {
    expect(
      judgeAgentDefinitionBody(
        edit(body(1), ['attributes', 0, 'default'], 'PT999999999999999999999999999999H'),
      ),
    ).toEqual({ ok: true })
  })

  test('no declared timeouts is a successful projection of the actual declarations', () => {
    const value = { references: [], attributes: [attributes(body(1))[2]] }
    expect(extractAgentDefinitionInputs(parsed(writeJsonLossless(value)))).toEqual({ ok: value })
  })

  test('published schema is the exact accepted resource and its root is unconstrained', () => {
    const bytes = readFileSync(new URL('../schema/agent-definition.schema.json', import.meta.url))
    const frozen = readFileSync(new URL('agent-definition.schema.json', normative))
    expect(bytes).toEqual(frozen)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'e115d2b7d47a3121c3706eeeae91a67c06c1363550d7f1e46f714f5e29a0cff9',
    )
    const runtime = createSchemaRuntime([schema])
    expect(runtime.compile({ $ref: schema.$id }).validate(null)).toBe(true)
    expect(judgeAgentDefinitionBody(null)).toEqual({ rejected: 'malformed' })
  })
})

describe('all-or-nothing rejection', () => {
  test.each(['references', 'attributes'])('missing %s never becomes an empty collection', key => {
    const value = remove(body(0), key)
    expect(judgeAgentDefinitionBody(value)).toEqual({ rejected: 'malformed' })
    expect(extractAgentDefinitionInputs(value)).toEqual({ rejected: 'malformed' })
  })
  test.each(['references', 'attributes'])('wrong-shaped %s rejects', key => {
    for (const wrong of [null, {}, false, ''])
      expect(judgeAgentDefinitionBody({ ...body(0), [key]: wrong })).toEqual({
        rejected: 'malformed',
      })
  })
  test('capability identity duplicates even when resident differs', () => {
    const first = object(references(body(1))[0])
    expect(
      judgeAgentDefinitionBody({ ...body(1), references: [first, { ...first, resident: false }] }),
    ).toEqual({ rejected: 'malformed' })
  })
  test('item duplicates even when author defaults differ', () => {
    const first = object(attributes(body(1))[0])
    expect(
      judgeAgentDefinitionBody({ ...body(1), attributes: [first, { ...first, default: 'PT2S' }] }),
    ).toEqual({ rejected: 'malformed' })
  })
  test.each([true, false])('resident %s is forbidden on a loop extension', resident => {
    const values = references(body(1))
    expect(
      judgeAgentDefinitionBody({ ...body(1), references: [{ ...object(values[1]), resident }] }),
    ).toEqual({ rejected: 'malformed' })
  })
  test('reference has no execution order slot', () => {
    expect(
      judgeAgentDefinitionBody({
        ...body(0),
        references: [{ ...object(references(body(1))[0]), order: 1 }],
      }),
    ).toEqual({ rejected: 'malformed' })
  })
  test.each(['disabled', 'usableBy', 'another_setting'])('undeclared slot %s rejects', item => {
    expect(judgeAgentDefinitionBody(edit(body(1), ['attributes', 0, 'item'], item))).toEqual({
      rejected: 'malformed',
    })
  })
  test.each(['PT0S', 'PT00H00M00.000S', 'PT-1S', 'P1D', 'PTInfinityS', 'PT1e3S', 'PT1S\n'])(
    'zero or malformed duration %s rejects',
    value => {
      expect(judgeAgentDefinitionBody(edit(body(1), ['attributes', 0, 'default'], value))).toEqual({
        rejected: 'malformed',
      })
    },
  )
  test.each(['', ' example/model', 'example/model ', 'example/model\n', null])(
    'invalid route %s rejects',
    value => {
      expect(judgeAgentDefinitionBody(edit(body(1), ['attributes', 2, 'default'], value))).toEqual({
        rejected: 'malformed',
      })
    },
  )
  test('author default is required and cannot be recovered elsewhere', () => {
    expect(
      judgeAgentDefinitionBody({
        ...body(0),
        attributes: [remove(object(attributes(body(1))[0]), 'default')],
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(judgeAgentDefinitionBody(edit(body(1), ['attributes', 0, 'default'], null))).toEqual({
      rejected: 'malformed',
    })
  })
  test('governance category is outside this projection', () => {
    expect(
      judgeAgentDefinitionBody(edit(body(1), ['attributes', 0, 'category'], 'governance')),
    ).toEqual({ rejected: 'malformed' })
  })
  test('equivalent-looking domain schemas are not the normative JSON value', () => {
    const domain = object(object(attributes(body(1))[0]).domain)
    const durationSchema = object(domain.schema)
    if (!Array.isArray(durationSchema.allOf)) throw new Error('missing schema fixture')
    for (const changed of [
      { ...durationSchema, description: 'extra' },
      { allOf: [...durationSchema.allOf].reverse() },
      { ...object(durationSchema.allOf[0]), pattern: '[1-9]' },
      { $ref: 'https://untrusted.invalid/schema' },
    ])
      expect(
        judgeAgentDefinitionBody(edit(body(1), ['attributes', 0, 'domain', 'schema'], changed)),
      ).toEqual({ rejected: 'malformed' })
  })
  test('strict boundary catches duplicates before a body can be judged', () => {
    expect(readJsonStrict('{"references":[],"attributes":[],"other":{"x":1,"x":2}}')).toEqual({
      failed: 'duplicate_member',
    })
  })
})
