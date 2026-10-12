import { expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  judgeConclusion,
  judgeDefinition,
  judgeInput,
  judgePositionedSubject,
} from '@omne-harness-lite/loop-extension'
import { inputAt, recordAt, variants } from './helpers.ts'

const dimensionVariants = variants.filter(variant => variant.dimension !== undefined)
const definitionBase = {
  name: 'g',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: 'g' },
}

for (const variant of dimensionVariants) {
  it(`admits the complete ${variant.position} ${JSON.stringify(variant.dimension)} values`, () => {
    const frame = {
      position: variant.position,
      dimension: variant.dimension,
      subject: variant.subject,
    }
    const definition = {
      ...definitionBase,
      position: variant.position,
      dimension: variant.dimension,
    }
    const record = recordAt(variant, 'observe', { kind: 'observed' })
    const input = { ...inputAt(variant), earlier: [record] }
    const before = JSON.stringify({ frame, definition, input, record })
    const expected = JSON.parse(before)
    expect(JSON.parse(writeJsonLossless(judgeDefinition(definition)))).toEqual({
      ok: expected.definition,
    })
    expect(JSON.parse(writeJsonLossless(judgePositionedSubject(frame)))).toEqual({
      ok: expected.frame,
    })
    const admitted = judgeInput(input)
    expect(JSON.parse(writeJsonLossless(admitted))).toEqual({ ok: expected.input })
    if (!('ok' in admitted)) throw new Error('legal input rejected')
    expect(
      JSON.parse(
        writeJsonLossless(judgeConclusion(record, { input: admitted.ok, extensionName: 'g' })),
      ),
    ).toEqual({ ok: expected.record })
    expect(JSON.stringify({ frame, definition, input, record })).toBe(before)
  })
}

for (const { position, dimensions } of [
  { position: 'after_model_call', dimensions: [{ scope: 'each' }, { scope: 'batch' }] },
  { position: 'after_action', dimensions: [{ ending: 'complete_reply' }, { ending: 'failure' }] },
]) {
  it(`rejects both wrong dimension kinds at ${position}`, () => {
    const variant = dimensionVariants.find(item => item.position === position)
    if (variant === undefined) throw new Error('missing fixture')
    for (const dimension of dimensions) {
      const definition = { ...definitionBase, position, dimension }
      const frame = { position, dimension, subject: variant.subject }
      const input = { ...inputAt(variant), dimension }
      const before = JSON.stringify({ definition, frame, input })
      expect(judgeDefinition(definition)).toEqual({ rejected: 'dimension_not_allowed' })
      expect(judgePositionedSubject(frame)).toEqual({ rejected: 'dimension_not_allowed' })
      expect(judgeInput(input)).toEqual({ rejected: 'dimension_not_allowed' })
      expect(JSON.stringify({ definition, frame, input })).toBe(before)
    }
  })
}

it('prioritizes missing dimensions across the root and earlier frames in either order', () => {
  const variant = dimensionVariants.find(item => item.position === 'after_action')
  if (variant === undefined) throw new Error('missing action fixture')
  const { dimension: omitted, ...missingRecord } = recordAt(variant, 'observe', {
    kind: 'observed',
  })
  const wrongRecord = { ...missingRecord, dimension: { ending: 'complete_reply' } }
  const { dimension: rootOmitted, ...missingInput } = inputAt(variant)
  expect(omitted).toEqual({ scope: 'each' })
  expect(rootOmitted).toEqual({ scope: 'each' })
  for (const input of [
    { ...missingInput, dimension: { ending: 'complete_reply' }, earlier: [missingRecord] },
    { ...missingInput, earlier: [wrongRecord] },
    { ...inputAt(variant), earlier: [wrongRecord, missingRecord] },
    { ...inputAt(variant), earlier: [missingRecord, wrongRecord] },
  ]) {
    const before = JSON.stringify(input)
    expect(judgeInput(input)).toEqual({ rejected: 'dimension_missing' })
    expect(JSON.stringify(input)).toBe(before)
  }
})

for (const property of ['position', 'dimension', 'ending', 'scope']) {
  it(`rejects an own ${property} getter without invoking it or changing descriptors`, () => {
    const position = property === 'scope' ? 'after_action' : 'after_model_call'
    const variant = dimensionVariants.find(item => item.position === position)
    if (variant === undefined) throw new Error('missing getter fixture')
    let calls = 0
    const dimension = { ...variant.dimension }
    const definition = { ...definitionBase, position, dimension }
    const frame = { position, dimension, subject: variant.subject }
    const input = { ...inputAt(variant), dimension }
    const targets =
      property === 'ending' || property === 'scope' ? [dimension] : [definition, frame, input]
    for (const target of targets)
      Object.defineProperty(target, property, {
        enumerable: true,
        configurable: true,
        get() {
          calls += 1
          return property === 'position' ? position : dimension
        },
      })
    const objects = [definition, frame, input, dimension]
    const before = objects.map(value => Object.getOwnPropertyDescriptors(value))
    expect(judgeDefinition(definition)).toEqual({ rejected: 'malformed' })
    expect(judgePositionedSubject(frame)).toEqual({ rejected: 'malformed' })
    expect(judgeInput(input)).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
    expect(objects.map(value => Object.getOwnPropertyDescriptors(value))).toEqual(before)
  })
}

for (const property of ['dimension', 'ending', 'scope']) {
  it(`rejects an inherited ${property} on a custom prototype without changing it`, () => {
    const position = property === 'scope' ? 'after_action' : 'after_model_call'
    const variant = dimensionVariants.find(item => item.position === position)
    if (variant === undefined || variant.dimension === undefined)
      throw new Error('missing prototype fixture')
    const dimension =
      property === 'dimension'
        ? { ...variant.dimension }
        : Object.setPrototypeOf({}, variant.dimension)
    const definition = { ...definitionBase, position }
    const frame = { position, subject: variant.subject }
    const { dimension: omitted, ...input } = inputAt(variant)
    expect(omitted).toEqual(variant.dimension)
    for (const value of [definition, frame, input]) {
      if (property === 'dimension') Object.setPrototypeOf(value, { dimension })
      else Object.defineProperty(value, 'dimension', { value: dimension, enumerable: true })
    }
    const objects = [definition, frame, input, dimension]
    const descriptors = objects.map(value => Object.getOwnPropertyDescriptors(value))
    const prototypes = objects.map(value => Object.getPrototypeOf(value))
    expect(judgeDefinition(definition)).toEqual({ rejected: 'malformed' })
    expect(judgePositionedSubject(frame)).toEqual({ rejected: 'malformed' })
    expect(judgeInput(input)).toEqual({ rejected: 'malformed' })
    expect(objects.map(value => Object.getOwnPropertyDescriptors(value))).toEqual(descriptors)
    objects.forEach((value, index) => expect(Object.getPrototypeOf(value)).toBe(prototypes[index]))
  })
}

it('admits complete own fields on null prototypes', () => {
  const variant = dimensionVariants.find(item => item.position === 'after_action')
  if (variant === undefined) throw new Error('missing null prototype fixture')
  const dimension = Object.setPrototypeOf({ ...variant.dimension }, null)
  const definition = Object.setPrototypeOf(
    { ...definitionBase, position: variant.position, dimension },
    null,
  )
  const frame = Object.setPrototypeOf(
    { position: variant.position, dimension, subject: variant.subject },
    null,
  )
  const input = Object.setPrototypeOf({ ...inputAt(variant), dimension }, null)
  const expected = JSON.parse(JSON.stringify({ definition, frame, input }))
  const objects = [definition, frame, input, dimension]
  const descriptors = objects.map(value => Object.getOwnPropertyDescriptors(value))
  expect(JSON.parse(writeJsonLossless(judgeDefinition(definition)))).toEqual({
    ok: expected.definition,
  })
  expect(JSON.parse(writeJsonLossless(judgePositionedSubject(frame)))).toEqual({
    ok: expected.frame,
  })
  expect(JSON.parse(writeJsonLossless(judgeInput(input)))).toEqual({ ok: expected.input })
  expect(objects.map(value => Object.getOwnPropertyDescriptors(value))).toEqual(descriptors)
  for (const value of objects) expect(Object.getPrototypeOf(value)).toBeNull()
})

it('preserves malformed, unknown position, unknown power and dimension refusal priority', () => {
  const cases = [
    {
      value: { position: 'future', power: 'future', dimension: null, order: 1 },
      rejected: 'malformed',
    },
    {
      value: { position: 'future', power: 'future', dimension: null },
      rejected: 'position_unknown',
    },
    { value: { position: 'after_action', power: 'future' }, rejected: 'power_unknown' },
    { value: { position: 'after_action' }, rejected: 'dimension_missing' },
    { value: { position: 'after_model_call' }, rejected: 'dimension_missing' },
    {
      value: { position: 'after_model_call', dimension: { ending: 'future' } },
      rejected: 'dimension_not_allowed',
    },
    { value: { position: 'after_action', dimension: null }, rejected: 'dimension_not_allowed' },
    {
      value: { position: 'attempt_started', dimension: { scope: 'each' } },
      rejected: 'dimension_not_allowed',
    },
  ]
  for (const { value, rejected } of cases) {
    const definition = { ...definitionBase, ...value }
    const before = JSON.stringify(definition)
    expect(judgeDefinition(definition)).toEqual({ rejected })
    expect(JSON.stringify(definition)).toBe(before)
  }
})
