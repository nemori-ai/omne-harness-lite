import { expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { judgeConclusion, judgeInput, validate, type ConclusionInputs } from '../src/index.ts'
import { object } from '../src/json.ts'
import {
  at,
  variants,
  inputAt,
  recordAt,
  call,
  assistant,
  visibility,
  reminder,
} from './helpers.ts'
import fixture from './normative-examples.json' with { type: 'json' }
import { readJsonStrict } from '@omne-harness-lite/content-blocks'

function admittedInput(value: JsonObject): ConclusionInputs {
  const judged = judgeInput(value)
  if ('rejected' in judged) throw new Error(`test input rejected: ${judged.rejected}`)
  return { input: judged.ok, extensionName: 'g' }
}
const actionVariant = variants[8]
if (actionVariant === undefined) throw new Error('missing action variant')
const actionInput = inputAt(actionVariant)
const inputs = admittedInput(actionInput)
const actionRecord = recordAt(actionVariant, 'rewrite', {
  kind: 'rewrite',
  subject: actionVariant.subject,
})
it('LE-CONCLUSION-PAIR: domain refusals precede technical configuration errors', () => {
  const invalidConfiguration = {}
  // @ts-expect-error deliberately missing auxiliary input/name at runtime
  expect(judgeConclusion({}, invalidConfiguration)).toEqual({ rejected: 'malformed' })
  // @ts-expect-error deliberately invalid auxiliary configuration
  expect(judgeConclusion({ ...actionRecord, power: 'future' }, invalidConfiguration)).toEqual({
    rejected: 'power_unknown',
  })
  // @ts-expect-error deliberately missing auxiliary configuration
  const callWithoutInputs = () => judgeConclusion(actionRecord)
  expect(callWithoutInputs).toThrow(TypeError)
  const otherVariant = variants[5]
  if (otherVariant === undefined) throw new Error('missing other variant')
  expect(() => judgeConclusion(actionRecord, admittedInput(inputAt(otherVariant)))).toThrow(
    TypeError,
  )
  expect(() =>
    judgeConclusion(
      actionRecord,
      admittedInput({
        ...actionInput,
        subject: { ...actionVariant.subject, call: { ...call, callId: 'other' }, batch: ['other'] },
      }),
    ),
  ).toThrow(TypeError)
  expect(judgeConclusion({ ...actionRecord, extension: 'another-extension' }, inputs)).toEqual({
    rejected: 'malformed',
  })
  expect(
    judgeConclusion({ ...actionRecord, extension: 'another-extension', power: 'future' }, inputs),
  ).toEqual({ rejected: 'malformed' })
  expect(judgeConclusion(actionRecord, inputs)).toHaveProperty('ok')
})
it('LE-CONCLUSION-NAME-PRIORITY: known actual name mirror remains domain malformed with invalid auxiliary data', () => {
  const invalidInput = { extensionName: 'g', input: { nonJson: undefined } }
  // @ts-expect-error deliberately invalid auxiliary input cannot conceal an independently known name mismatch
  expect(judgeConclusion({ ...actionRecord, extension: 'other' }, invalidInput)).toEqual({
    rejected: 'malformed',
  })
})
it('LE-CONCLUSION-IMMUTABLE: public row 9 preserves all call members, definition and batch', () => {
  expect(
    judgeConclusion(
      {
        ...actionRecord,
        output: {
          kind: 'rewrite',
          subject: {
            ...actionVariant.subject,
            call: { ...call, arguments: { command: 'readonly' } },
          },
        },
      },
      inputs,
    ),
  ).toHaveProperty('ok')
  for (const key of ['id', 'callId', 'tool'])
    expect(
      judgeConclusion(
        {
          ...actionRecord,
          output: {
            kind: 'rewrite',
            subject: { ...actionVariant.subject, call: { ...call, [key]: 'other' } },
          },
        },
        inputs,
      ),
    ).toEqual({ rejected: 'rewrite_touches_immutable' })
  for (const changed of [
    { ...actionVariant.subject, definition: { name: 'other' } },
    { ...actionVariant.subject, batch: ['other'] },
  ])
    expect(
      judgeConclusion({ ...actionRecord, output: { kind: 'rewrite', subject: changed } }, inputs),
    ).toEqual({ rejected: 'rewrite_touches_immutable' })
  const malformedVariant = {
    ...actionRecord,
    output: { kind: 'rewrite', subject: { proposed: { state: 'completed' } } },
  }
  const invalidConfiguration = {}
  // @ts-expect-error row 9 wrong Subject is independently determined
  expect(judgeConclusion(malformedVariant, invalidConfiguration)).toEqual({
    rejected: 'rewrite_touches_immutable',
  })
})
it('LE-CONCLUSION-UNPARSEABLE: never repair model parameter parsing failure', () => {
  const { arguments: parsed, ...base } = call
  expect(parsed).toBeDefined()
  const unparseable = {
    ...actionInput,
    subject: {
      ...actionVariant.subject,
      call: { ...base, unparseable: true, rawArguments: '{broken' },
    },
  }
  expect(judgeConclusion(actionRecord, admittedInput(unparseable))).toEqual({
    rejected: 'rewrite_touches_immutable',
  })
  expect(writeJsonLossless(unparseable)).toContain('"rawArguments":"{broken"')
})
it('LE-CONCLUSION-MODEL: public comparison permits added derivation, rejects words/time/block changes', () => {
  const media = {
    id: 'voice_1',
    kind: 'voice',
    mediaType: 'audio/wav',
    data: { inline: 'AA==' },
    visibility,
  }
  const subject = { producer: 'model', message: { ...assistant, blocks: [media] } }
  const modelInput = admittedInput({
    position: 'before_persist_message',
    subject,
    earlier: [],
    log: 'l',
    environment: 'e',
  })
  const converted = {
    ...subject,
    message: {
      ...subject.message,
      blocks: [
        {
          ...media,
          renderings: [
            {
              producedBy: 'system',
              blocks: [{ id: 'derived_1', kind: 'text', text: 'words', visibility }],
            },
          ],
          transcript: 'words',
        },
      ],
    },
  }
  const record = {
    extension: 'g',
    position: 'before_persist_message',
    power: 'rewrite',
    output: { kind: 'rewrite', subject: converted },
    at,
  }
  expect(judgeConclusion(record, modelInput)).toHaveProperty('ok')
  expect(
    judgeConclusion(
      {
        ...record,
        output: {
          kind: 'rewrite',
          subject: {
            ...converted,
            message: { ...converted.message, createdAt: '2026-09-24T00:00:00Z' },
          },
        },
      },
      modelInput,
    ),
  ).toEqual({ rejected: 'rewrite_touches_immutable' })
  expect(
    judgeConclusion(
      {
        ...record,
        output: {
          kind: 'rewrite',
          subject: {
            ...converted,
            message: {
              ...converted.message,
              blocks: [{ ...converted.message.blocks[0], id: 'other' }],
            },
          },
        },
      },
      modelInput,
    ),
  ).toEqual({ rejected: 'rewrite_touches_immutable' })
})
for (const source of [
  { kind: 'loop_guard', level: 'L1', finding: 'x' },
  { kind: 'loop_guard', level: 'level_1', finding: 'x' },
  { kind: 'unknown_foreign_kind', privateData: null },
])
  it(`LE-SOURCE-PROHIBITED-${source.kind}-${'level' in source ? source.level : 'unknown'}: row10 owns foreign source private fields`, () => {
    const variant = variants[0]
    if (variant === undefined) throw new Error('missing variant')
    const record = recordAt(variant, 'rewrite', {
      kind: 'inject',
      message: { ...reminder, source },
    })
    expect(judgeConclusion(record, admittedInput(inputAt(variant)))).toEqual({
      rejected: 'inject_source_mismatch',
    })
    expect(
      judgeConclusion({ ...record, power: 'observe' }, admittedInput(inputAt(variant))),
    ).toEqual({ rejected: 'output_not_allowed_for_power' })
    expect(
      judgeConclusion(
        {
          ...record,
          output: { kind: 'inject', message: { ...reminder, source, extraMessageField: true } },
        },
        admittedInput(inputAt(variant)),
      ),
    ).toEqual({ rejected: 'malformed' })
  })
for (const source of [
  null,
  'not-an-object',
  {},
  { kind: 1 },
  { kind: 'extension' },
  { kind: 'extension', extension: '' },
  { kind: 'extension', extension: ' g' },
  { kind: 'extension', extension: 'g', extra: true },
])
  it(`LE-SOURCE-SHAPE-${JSON.stringify(source)}: ordinary source shape precedes row10`, () => {
    const variant = variants[0]
    if (variant === undefined) throw new Error('missing variant')
    expect(
      judgeConclusion(
        recordAt(variant, 'observe', { kind: 'inject', message: { ...reminder, source } }),
        admittedInput(inputAt(variant)),
      ),
    ).toEqual({ rejected: 'malformed' })
  })
it('LE-CONCLUSION-EX1: frozen ask/veto/rewrite values compare to exact frozen input, no replay claim', () => {
  const inputRow = fixture.rows.find(row => row.id === 'LE-V1-6-JSON-02')
  if (inputRow === undefined) throw new Error('missing frozen EX1 input')
  const parsed = readJsonStrict(inputRow.text)
  if ('failed' in parsed || !object(parsed.ok)) throw new Error('bad frozen EX1 input')
  const context = { ...admittedInput(parsed.ok), extensionName: 'prod-db-guard' }
  for (const id of ['LE-V1-6-JSON-03', 'LE-V1-6-JSON-04', 'LE-V1-6-JSON-05']) {
    const row = fixture.rows.find(item => item.id === id)
    if (row === undefined) throw new Error('missing frozen EX1 conclusion')
    const record = readJsonStrict(row.text)
    if ('failed' in record) throw new Error('bad frozen EX1 record')
    expect(validate('Conclusion', record.ok).valid).toBe(true)
    expect(judgeConclusion(record.ok, context)).toHaveProperty('ok')
  }
})
