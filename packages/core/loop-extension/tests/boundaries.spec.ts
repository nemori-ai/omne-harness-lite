import { expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import {
  judgeConclusion,
  judgeDefinition,
  judgeInput,
  judgeOutput,
  judgeValue,
  validate,
  type ConclusionInputs,
} from '../src/v3/index.ts'
import { at, call, inputAt, variants, json, recordAt, reminder } from './helpers.ts'

it('LE-ORDER-1: ordinary malformed wins over position/power/dimension', () => {
  const definition = {
    name: 'g',
    position: 'future',
    power: 'future',
    dimension: null,
    implementation: { kind: 'builtin', builtinName: 'g' },
  }
  expect(judgeDefinition({ ...definition, order: 1 })).toEqual({ rejected: 'malformed' })
  expect(judgeDefinition(definition)).toEqual({ rejected: 'position_unknown' })
  expect(judgeDefinition({ ...definition, position: 'after_action' })).toEqual({
    rejected: 'power_unknown',
  })
  expect(judgeDefinition({ ...definition, position: 'after_action', power: 'veto' })).toEqual({
    rejected: 'dimension_not_allowed',
  })
  expect(
    judgeDefinition({
      name: 'g',
      position: 'after_action',
      power: 'veto',
      implementation: { kind: 'builtin', builtinName: 'g' },
    }),
  ).toEqual({ rejected: 'dimension_missing' })
})
it('LE-ORDER-6-10: table priority precedes forbidden ask and source mismatch', () => {
  const invalidInject = {
    kind: 'inject',
    message: { ...reminder, source: { kind: 'extension', extension: 'other' } },
  }
  expect(
    judgeValue('Conclusion', {
      extension: 'g',
      position: 'after_terminal',
      power: 'observe',
      output: invalidInject,
      at,
    }),
  ).toEqual({ rejected: 'output_not_allowed_for_power' })
  expect(
    judgeValue('Conclusion', {
      extension: 'g',
      position: 'after_terminal',
      power: 'rewrite',
      output: invalidInject,
      at,
    }),
  ).toEqual({ rejected: 'output_not_allowed_at_position' })
  expect(
    judgeValue('Conclusion', {
      extension: 'g',
      position: 'attempt_started',
      power: 'rewrite',
      output: invalidInject,
      at,
    }),
  ).toEqual({ rejected: 'inject_source_mismatch' })
  const ask = {
    kind: 'ask',
    card: {
      explanation: 'x',
      options: [{ id: 'y', label: 'yes' }],
      about: { position: 'after_terminal' },
    },
  }
  expect(
    judgeValue('Conclusion', {
      extension: 'g',
      position: 'after_terminal',
      power: 'rewrite',
      output: ask,
      at,
    }),
  ).toEqual({ rejected: 'output_not_allowed_for_power' })
  expect(
    judgeValue('Conclusion', {
      extension: 'g',
      position: 'after_terminal',
      power: 'veto',
      output: ask,
      at,
    }),
  ).toEqual({ rejected: 'ask_at_forbidden_position' })
})
it('LE-ASK-CORRELATION: about position/call identity malformed before combination', () => {
  const variant = variants[8]
  if (variant === undefined) throw new Error('missing test variant')
  const card = {
    explanation: 'x',
    options: [{ id: 'y', label: 'yes' }],
    about: { position: 'before_action', callId: 'call_99' },
  }
  const record = recordAt(variant, 'observe', { kind: 'ask', card })
  expect(judgeValue('Conclusion', record)).toEqual({ rejected: 'malformed' })
  expect(
    judgeValue('Conclusion', {
      ...record,
      output: { kind: 'ask', card: { ...card, about: { position: 'before_model_call' } } },
    }),
  ).toEqual({ rejected: 'malformed' })
})
it('LE-NUM-EXACT: arbitrary precision integer/status and original payload round-trip', () => {
  expect(validate('AttemptStartedSubject', { attempt: new LosslessNumber('1e400') }).valid).toBe(
    true,
  )
  expect(
    validate('AttemptStartedSubject', { attempt: new LosslessNumber('1.0000000000000000000001') })
      .valid,
  ).toBe(false)
  const variant = variants[7]
  if (variant === undefined) throw new Error('missing test variant')
  const input = inputAt(variant)
  const value = {
    ...input,
    subject: {
      ...variant.subject,
      statusCode: new LosslessNumber('9007199254740993'),
      inBand: true,
    },
  }
  const before = writeJsonLossless(value)
  const judged = judgeInput(value)
  expect(judged).toHaveProperty('ok')
  if ('ok' in judged) expect(writeJsonLossless(judged.ok)).toBe(before)
  expect(
    judgeInput({
      ...input,
      subject: { ...variant.subject, statusCode: new LosslessNumber('1.0000000000000000000001') },
    }),
  ).toEqual({ rejected: 'malformed' })
  expect(judgeInput({ ...input, subject: { ...variant.subject, inBand: true } })).toEqual({
    rejected: 'malformed',
  })
  expect(
    judgeInput({ ...input, subject: { ...variant.subject, statusCode: 503, inBand: false } }),
  ).toEqual({ rejected: 'malformed' })
})
it('LE-JSON-BOUNDARY: duplicate escaped key and non-JSON data cannot enter', () => {
  expect(
    readJsonStrict('{"position":"before_action","po\\u0073ition":"after_terminal"}'),
  ).toHaveProperty('failed')
  let invoked = false
  const body = {
    get position() {
      invoked = true
      return 'before_action'
    },
  }
  expect(judgeDefinition(body)).toEqual({ rejected: 'malformed' })
  expect(invoked).toBe(false)
  for (const value of [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    { missing: undefined },
    { x: 1n },
    new Date(),
    new LosslessNumber('1e400'),
  ])
    expect(judgeDefinition(value)).toEqual({ rejected: 'malformed' })
  expect(judgeOutput({ kind: 'stop', reason: 'x', terminal: null })).toEqual({
    rejected: 'malformed',
  })
  const stop = judgeOutput({ kind: 'stop', reason: 'x' })
  expect(stop).toHaveProperty('ok')
  if ('ok' in stop) expect(stop.ok).not.toHaveProperty('terminal')
})
for (const codePoint of OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS)
  it(`LE-ENV-WS-${codePoint}: exact opaque boundaries`, () => {
    const whitespace = String.fromCodePoint(codePoint)
    expect(validate('EnvironmentHandle', `${whitespace}env`).valid).toBe(false)
    expect(validate('EnvironmentHandle', `env${whitespace}`).valid).toBe(false)
    expect(validate('EnvironmentHandle', `env${whitespace}opaque`).valid).toBe(true)
  })
it('LE-JSON-PRESERVE: pure open data plans do not erase lossless values or null', () => {
  const plan = json('{"opaque":1e400,"long":0.123456789012345678901234567890,"null":null}')
  expect(validate('CompactionPlan', plan).valid).toBe(true)
  const result = judgeValue('CompactionPlan', plan)
  expect(result).toHaveProperty('ok')
  if ('ok' in result) expect(writeJsonLossless(result.ok)).toBe(writeJsonLossless(plan))
  expect(validate('CompactionPlan', new LosslessNumber('1e400')).valid).toBe(false)
})
it('LE-INPUT-SUBJECT: bad variant/presence/unknown member never repaired', () => {
  const variant = variants[8]
  if (variant === undefined) throw new Error('missing test variant')
  const input = inputAt(variant)
  expect(judgeInput({ ...input, subject: { attempt: 1 } })).toEqual({ rejected: 'malformed' })
  expect(judgeInput({ ...input, tenant: 't' })).toEqual({ rejected: 'malformed' })
  expect(
    validate('BeforeActionSubject', {
      call,
      definition: { name: 'shell' },
      batch: ['call_01', 'call_01'],
    }).valid,
  ).toBe(false)
})
for (const variant of variants.filter(item => item.dimension !== undefined))
  for (const dimension of [null, [], 1, 'each'])
    it(`LE-DIMENSION-PRIORITY-${variant.position}-${JSON.stringify(variant.dimension)}-${JSON.stringify(dimension)}: invalid selectors do not select a subject variant`, () => {
      const input = { ...inputAt(variant), dimension }
      const before = writeJsonLossless(input)
      expect(judgeInput(input)).toEqual({ rejected: 'dimension_not_allowed' })
      expect(writeJsonLossless(input)).toBe(before)
      expect(judgeInput({ ...input, subject: {} })).toEqual({ rejected: 'malformed' })
    })
for (const variant of variants.filter(item => item.position === 'after_action'))
  for (const dimension of [null, [], 1, 'each', {}, { scope: 'future' }, { ending: 'failure' }])
    for (const callId of [undefined, 'call_01'])
      it(`LE-CONCLUSION-DIMENSION-${JSON.stringify(variant.dimension)}-${JSON.stringify(dimension)}-${callId ?? 'absent'}: illegal scope cannot impose call/card presence`, () => {
        const input = judgeInput(inputAt(variant))
        if ('rejected' in input) throw new Error('control input rejected')
        const record = {
          extension: 'g',
          position: 'after_action',
          power: 'veto',
          dimension,
          ...(callId === undefined ? {} : { callId }),
          output: { kind: 'observed' },
          at,
        }
        const configuration: ConclusionInputs = { input: input.ok, extensionName: 'g' }
        expect(judgeConclusion(record, configuration)).toEqual({
          rejected: 'dimension_not_allowed',
        })
        const ask = {
          ...record,
          output: {
            kind: 'ask',
            card: {
              explanation: 'x',
              options: [{ id: 'yes', label: 'yes' }],
              about: {
                position: 'after_action',
                ...(callId === undefined ? {} : { callId }),
              },
            },
          },
        }
        expect(judgeConclusion(ask, configuration)).toEqual({
          rejected: 'dimension_not_allowed',
        })
        expect(judgeConclusion({ ...record, callId: ' ' }, configuration)).toEqual({
          rejected: 'malformed',
        })
        expect(judgeConclusion({ ...record, extra: true }, configuration)).toEqual({
          rejected: 'malformed',
        })
        expect(
          judgeConclusion(
            {
              ...ask,
              output: {
                ...ask.output,
                card: {
                  ...ask.output.card,
                  about: { position: 'before_model_call' },
                },
              },
            },
            configuration,
          ),
        ).toEqual({ rejected: 'malformed' })
      })
for (const variant of variants.filter(item => item.dimension !== undefined))
  it(`LE-DIMENSION-CONTROL-${variant.position}-${JSON.stringify(variant.dimension)}: admitted controls and missing dimension keep their own predicates`, () => {
    const value = inputAt(variant)
    const input = judgeInput(value)
    if ('rejected' in input) throw new Error('control input rejected')
    const configuration: ConclusionInputs = { input: input.ok, extensionName: 'g' }
    const record = recordAt(variant, 'observe', { kind: 'observed' })
    expect(judgeConclusion(record, configuration)).toHaveProperty('ok')
    const withoutDimension = (data: typeof value) =>
      Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'dimension'))
    expect(judgeInput(withoutDimension(value))).toEqual({ rejected: 'dimension_missing' })
    expect(judgeConclusion(withoutDimension(record), configuration)).toEqual({
      rejected: 'dimension_missing',
    })
    if (variant.position === 'after_action') {
      const wrongCallPresence =
        variant.callId === undefined
          ? { ...record, callId: 'call_01' }
          : Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'callId'))
      expect(judgeConclusion(wrongCallPresence, configuration)).toEqual({
        rejected: 'malformed',
      })
    }
  })
