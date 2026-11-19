import type { JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { controlOf, formOf } from '../src/model/value-control.ts'

const text = (value: string): JsonValue => ({ kind: 'string', value })
const object = (entries: Record<string, JsonValue>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
})
const array = (...items: JsonValue[]): JsonValue => ({ kind: 'array', items })

describe('the control a declared value gets', () => {
  it('a string with an enum of strings is a pick of those strings, in their order', () => {
    expect(
      controlOf(object({ type: text('string'), enum: array(text('auto'), text('draft')) })),
    ).toEqual({ kind: 'pick', values: ['auto', 'draft'] })
    expect(controlOf(object({ enum: array(text('b'), text('a')) }))).toEqual({
      kind: 'pick',
      values: ['b', 'a'],
    })
  })

  it('a string without an enum is a text box', () => {
    expect(controlOf(object({ type: text('string') }))).toEqual({ kind: 'text' })
    expect(
      controlOf(
        object({
          type: text('string'),
          minLength: { kind: 'number', lexeme: '1' },
          maxLength: { kind: 'number', lexeme: '64' },
        }),
      ),
    ).toEqual({ kind: 'text' })
  })

  it.each([
    ['an integer', object({ type: text('integer') })],
    ['a boolean', object({ type: text('boolean') })],
    [
      'an enum with a value that is not a string',
      object({ enum: array(text('a'), { kind: 'null' }) }),
    ],
    ['an empty enum', object({ enum: array() })],
    ['an enum that is not a list', object({ type: text('string'), enum: text('auto') })],
    ['a schema with no type', object({})],
    ['a schema that is not an object', text('string')],
  ])('%s is only shown', (_case, schema) => {
    expect(controlOf(schema)).toEqual({ kind: 'none' })
  })
})

describe('the form a data body gets', () => {
  const bodySchema = (properties: Record<string, JsonValue>, required: string[] = []) =>
    object({
      type: text('object'),
      properties: object(properties),
      required: array(...required.map(text)),
    })

  it('a top-level object of strings, enums, booleans and numbers is one control per property, required marked', () => {
    expect(
      formOf(
        bodySchema(
          {
            url: object({ type: text('string'), title: text('地址') }),
            mode: object({ enum: array(text('a'), text('b')) }),
            enabled: object({ type: text('boolean') }),
            depth: object({ type: text('integer') }),
            ratio: object({ type: text('number') }),
          },
          ['url'],
        ),
      ),
    ).toEqual({
      kind: 'fields',
      fields: [
        { key: 'url', title: '地址', required: true, control: { kind: 'text' } },
        {
          key: 'mode',
          title: null,
          required: false,
          control: { kind: 'pick', values: ['a', 'b'] },
        },
        { key: 'enabled', title: null, required: false, control: { kind: 'switch' } },
        { key: 'depth', title: null, required: false, control: { kind: 'number' } },
        { key: 'ratio', title: null, required: false, control: { kind: 'number' } },
      ],
    })
  })

  it.each([
    ['a property that is an object', bodySchema({ nested: object({ type: text('object') }) })],
    ['a property that is an array', bodySchema({ list: object({ type: text('array') }) })],
    ['a property with no type', bodySchema({ any: object({}) })],
    ['an object with no properties', bodySchema({})],
    ['a body that is not an object', object({ type: text('string') })],
    ['a schema that says nothing', object({})],
    ['a schema that is not an object', text('object')],
  ])('%s is taken as JSON text', (_case, schema) => {
    expect(formOf(schema)).toEqual({ kind: 'json' })
  })
})
