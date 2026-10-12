import { expect, test } from 'vitest'
import { LosslessNumber, readJsonStrict } from '@omne-harness-lite/content-blocks'
import { validate as toolValidate } from '@omne-harness-lite/tool-definition'
import v2 from '@omne-harness-lite/tool-definition/schema/v2' with { type: 'json' }
import {
  answerPresence,
  checkManifestAppendInput,
  judgeManifestAppend,
  readEvaluationProjection,
} from '@omne-harness-lite/assembly-manifest'
import { evaluated, input } from './support.ts'

test.each([undefined, null, '', ' session', 'session\n', {}])(
  'invalid identity %j is rejected',
  value => {
    expect(checkManifestAppendInput(value, 0, input())).toEqual({ failure: 'invalidInput' })
  },
)
test.each([undefined, null, -1, 1.1, true, '0', Infinity, NaN])(
  'invalid expectedHead %j is rejected',
  value => {
    expect(checkManifestAppendInput('session', value, input())).toEqual({ failure: 'invalidInput' })
  },
)
test('exact integer spelling and huge exponent are compared without native rounding', () => {
  for (const value of [
    new LosslessNumber('0e100000'),
    new LosslessNumber('1.00'),
    new LosslessNumber('1e999999'),
  ]) {
    const request = checkManifestAppendInput('session', value, input())
    if (!('ok' in request)) throw new Error('valid integer rejected')
    const decision = judgeManifestAppend(
      { session: request.ok.session, head: 0, filledAt: {} },
      request.ok,
    )
    expect(decision).toEqual(
      value.source.startsWith('0') ? { admissible: true } : { failure: 'headMismatch', head: 0 },
    )
  }
})
test('copy rejects executable getters and snapshots mutable callers before asynchronous IO', () => {
  let accesses = 0
  expect(
    checkManifestAppendInput('session', 0, {
      get evaluation() {
        accesses++
        return { kind: 'mint' }
      },
      tables: input().tables,
      content: {},
    }),
  ).toEqual({ failure: 'invalidInput' })
  expect(accesses).toBe(0)
  const supplied = input()
  const request = checkManifestAppendInput('session', 0, supplied)
  if (!('ok' in request)) throw new Error('legal input rejected')
  supplied.tables.tool.filledAt = 99
  expect(request.ok.record.tables.tool?.filledAt).toBe(1)
  expect(Object.isFrozen(request.ok.record.content)).toBe(true)
})
test.each([
  { evaluation: { kind: 'mint', ref: 'no' } },
  { evaluation: { kind: 'given' } },
  { evaluation: { kind: 'reuse', ref: ' tail ' } },
  { evaluation: { kind: 'unknown' } },
  { tables: {} },
  { tables: { unknown: { filledAt: 1, composition: [] } } },
  { tables: { tool: { filledAt: 1.5, composition: [] } } },
  { tables: { tool: { filledAt: 1 } } },
  { tables: { tool: { filledAt: 1, composition: [], extra: true } } },
  { seq: 1 },
  { content: undefined },
])('invalid shell is rejected: %j', change => {
  expect(checkManifestAppendInput('session', 0, { ...input(), ...change })).toEqual({
    failure: 'invalidInput',
  })
})
test('shared public AE4 judge checks full DTO; projection preserves complete strict values', () => {
  const content = input().content
  expect(readEvaluationProjection(content)).toHaveProperty('ok.evaluation', evaluated())
  expect(
    readEvaluationProjection({ ...content, filledBy: 'outside_manifest_ownership', additional: 1 }),
  ).toHaveProperty('ok')
  expect(
    readEvaluationProjection({ ...content, evaluation: { ...content.evaluation, extra: true } }),
  ).toEqual({ failure: 'unavailable', reason: 'invalid_evaluation_content' })
  for (const value of [
    null,
    [],
    {},
    { evaluation: evaluated() },
    { evaluation: {}, compositionOrder: [] },
    { evaluation: evaluated(), compositionOrder: [evaluated().root] },
  ])
    expect(readEvaluationProjection(value)).toEqual({
      failure: 'unavailable',
      reason: 'invalid_evaluation_content',
    })
  const duplicate = readJsonStrict('{"evaluation":{},"evaluation":{},"compositionOrder":[]}')
  expect(duplicate).toHaveProperty('failed', 'duplicate_member')
})
test('all dependency names require an explicit same-observation fact; prototype keys are ordinary names', () => {
  const facts = Object.create(null) as Record<string, 'present' | 'absent'>
  facts['svc-a'] = 'present'
  facts['svc-b'] = 'absent'
  facts.__proto__ = 'present'
  expect(answerPresence(facts, ['svc-a', 'svc-b', '__proto__'])).toEqual({
    presence: { 'svc-a': 'present', 'svc-b': 'absent', ['__proto__']: 'present' },
  })
  expect(answerPresence(facts, ['svc-a', 'unknown'])).toEqual({ failure: 'unavailable' })
  expect(answerPresence({}, ['constructor'])).toEqual({ failure: 'unavailable' })
  // Only this unchanged public component is consumed from the current owner; no ToolDefinition upgrade.
  expect(v2.$defs.DependencyName).toMatchObject({ type: 'string', minLength: 1 })
  expect(toolValidate('DependencyName', ' spaces are legal ')).toEqual({ valid: true })
})

test('projection order is an exact permutation, with no root, duplicate, omission or repair', () => {
  // DTO relationship fixture. The independent real evaluate/write path is exercised in store.spec.ts.
  const a = { category: 'tool', name: 'example:a' } as const
  const b = { category: 'skill', name: 'example:b' } as const
  const original = evaluated()
  const evaluation = {
    ...original,
    assets: [
      ...original.assets,
      {
        capability: a,
        asset: 'asset_a',
        version: 1,
        from: 'factory',
        replaced: [],
        resident: false,
      },
      {
        capability: b,
        asset: 'asset_b',
        version: 1,
        from: 'factory',
        replaced: [],
        resident: true,
      },
    ],
    composition: [a, b],
    values: [
      ...original.values,
      { capability: a, item: 'usableBy', value: { allowed: ['member'] }, from: 'factory' },
      { capability: b, item: 'usableBy', value: { allowed: ['member'] }, from: 'factory' },
    ],
  }
  expect(readEvaluationProjection({ evaluation, compositionOrder: [b, a] })).toHaveProperty(
    'ok.compositionOrder',
    [b, a],
  )
  for (const order of [[], [a], [a, a], [a, b, original.root], [a, { ...b, name: 'other' }]])
    expect(readEvaluationProjection({ evaluation, compositionOrder: order })).toEqual({
      failure: 'unavailable',
      reason: 'invalid_evaluation_content',
    })
})
