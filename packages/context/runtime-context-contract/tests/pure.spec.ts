import { expect, it } from 'vitest'
import {
  decodeScopeRef,
  decodeContextBlockKey,
  judgeNeed,
  judgeBinding,
  reduceStep,
  diffForReminder,
} from '@omne-harness/runtime-context-contract'
import { numberSchema, declaration, scope } from '../src/testing/fixtures.js'
import type { StatefulBlockDescriptor, Snapshot } from '@omne-harness/runtime-context-contract'
it('decodes scopes and keys without accepting cycles, extra keys or blank identities', () => {
  expect(decodeScopeRef({ ref: 'root', parent: { ref: 'ancestor' } })).toHaveProperty('ok')
  for (const input of [
    null,
    [],
    { ref: '' },
    { ref: 'x', extra: 1 },
    { ref: 'x', parent: { ref: '' } },
  ])
    expect(decodeScopeRef(input)).toHaveProperty('failure')
  const cyclic: { ref: string; parent?: unknown } = { ref: 'cycle' }
  cyclic.parent = cyclic
  expect(decodeScopeRef(cyclic)).toHaveProperty('failure')
  for (const input of ['owner.name', 'owner.multi.part'])
    expect(decodeContextBlockKey(input)).toHaveProperty('ok')
  for (const input of [null, '', '.name', 'owner.', 'no-dot', 'owner.bad name'])
    expect(decodeContextBlockKey(input)).toHaveProperty('failure')
})
it('judges the need fields and schema identity independently of consumer authorization', () => {
  const need = {
    name: 'one',
    shape: numberSchema,
    consumer: 'model',
    purpose: 'test',
    necessity: 'required',
  } as const
  expect(judgeNeed(need)).toHaveProperty('ok')
  expect(judgeNeed({ ...need, name: '' })).toHaveProperty('failure')
  expect(judgeNeed({ ...need, extra: 1 })).toHaveProperty('failure')
  const binding = { need, key: 'suite.value' } as const
  expect(
    judgeBinding(binding, {
      descriptors: { get: () => declaration() },
      registrationRequired: true,
    }),
  ).toHaveProperty('ok')
  expect(
    judgeBinding(binding, {
      descriptors: { get: () => declaration() },
      registrationRequired: false,
    }),
  ).toHaveProperty('failure.reason', 'required-on-optional')
  expect(
    judgeBinding(
      { ...binding, need: { ...need, shape: { '~standard': { ...numberSchema['~standard'] } } } },
      { descriptors: { get: () => declaration() }, registrationRequired: true },
    ),
  ).toHaveProperty('failure.reason', 'shape-mismatch')
})
it('reduces accepted updates only, preserves order and refuses async schemas and invalid outputs', () => {
  const d: StatefulBlockDescriptor<'suite.state', unknown, unknown> = {
    ...declaration(),
    key: 'suite.state',
    kind: 'stateful',
    writers: ['tool'],
    reduce: (current, update) => Number(current ?? 0) + Number(update),
    persistence: 'checkpointed',
    singleWriterPerStep: false,
    updateSchema: numberSchema,
  }
  const updates = [
    { origin: { origin: 'one' }, key: 'suite.state', writer: 'tool', update: 2 },
    { origin: { origin: 'two' }, key: 'suite.state', writer: 'model', update: 9 },
    { origin: { origin: 'three' }, key: 'suite.state', writer: 'tool', update: 'bad' },
    { origin: { origin: 'four' }, key: 'suite.state', writer: 'tool', update: 3 },
  ] as const
  const input = {
    scope: scope('pure'),
    step: { step: 'one' },
    updates,
    descriptors: { get: () => d },
    current: () => 1,
  }
  const result = reduceStep(input)
  expect(result.committed[0]?.value).toBe(6)
  expect(result.committed[0]?.updates.map(u => u.origin.origin)).toEqual(['one', 'four'])
  expect(result.rejected.map(r => r.rejection.kind)).toEqual(['unauthorized', 'shape'])
  expect(updates[0].update).toBe(2)
  const asyncDescriptor = {
    ...d,
    updateSchema: {
      '~standard': { version: 1, vendor: 'async', validate: async (value: unknown) => ({ value }) },
    },
  } as const
  expect(reduceStep({ ...input, descriptors: { get: () => asyncDescriptor } }).committed).toEqual(
    [],
  )
})
it('reminders omit private and per-request blocks and withhold disallowed previous values', () => {
  const target = scope('reminder'),
    key = 'suite.value',
    before: Snapshot = {
      scope: target,
      viewRevision: 1,
      cursor: { cursor: 'one' },
      missing: [],
      perRequest: [],
      blocks: [
        {
          key,
          revision: 1,
          state: { kind: 'value', value: 1 },
          volatility: 'stable',
          evidence: { key, revision: 1, scope: target, generation: 1 },
        },
      ],
    }
  const original = before.blocks[0]
  if (!original) throw new Error('Missing fixture block')
  const next: Snapshot = {
    ...before,
    viewRevision: 2,
    blocks: [
      {
        ...original,
        key,
        revision: 2,
        state: { kind: 'value', value: 2 },
        volatility: 'stable',
        evidence: { key, revision: 2, scope: target, generation: 1 },
      },
    ],
  }
  expect(
    diffForReminder({ previous: before, next, descriptors: { get: () => declaration() } })[0]
      ?.previous,
  ).toEqual({ kind: 'value', value: 1 })
  expect(
    diffForReminder({
      previous: before,
      next,
      descriptors: { get: () => declaration({ carriesPrevious: false }) },
    })[0]?.previous,
  ).toEqual({ kind: 'withheld' })
  expect(
    diffForReminder({
      previous: before,
      next,
      descriptors: { get: () => declaration({ consumers: ['tool'] }) },
    }),
  ).toEqual([])
  expect(
    diffForReminder({
      previous: before,
      next,
      descriptors: { get: () => declaration({ volatility: 'per-request' }) },
    }),
  ).toEqual([])
})

it('preserves unexpected reducer and validator errors instead of relabeling them as shape issues', () => {
  const defect = new Error('owner defect')
  const d: StatefulBlockDescriptor<'suite.state', unknown, unknown> = {
    ...declaration(),
    key: 'suite.state',
    kind: 'stateful',
    writers: ['tool'],
    reduce: () => {
      throw defect
    },
    persistence: 'checkpointed',
    singleWriterPerStep: false,
  }
  const input = {
    scope: scope('defect'),
    step: { step: 'one' },
    updates: [
      { origin: { origin: 'one' }, key: 'suite.state', writer: 'tool', update: 1 },
    ] as const,
    descriptors: { get: () => d },
    current: () => undefined,
  }
  expect(() => reduceStep(input)).toThrow(defect)
  expect(() =>
    reduceStep({
      ...input,
      descriptors: {
        get: () => ({
          ...d,
          reduce: () => 1,
          schema: {
            '~standard': {
              version: 1,
              vendor: 'defect',
              validate: () => {
                throw defect
              },
            },
          },
        }),
      },
    }),
  ).toThrow(defect)
})
it('reports asynchronous definition refusal separately with the corresponding parameter path', () => {
  const asyncSchema = {
    '~standard': { version: 1, vendor: 'async', validate: async (value: unknown) => ({ value }) },
  } as const
  expect(
    judgeNeed({
      name: 'async',
      shape: asyncSchema,
      consumer: 'model',
      purpose: 'test',
      necessity: 'required',
    }),
  ).toEqual({ failure: { reason: 'schema-not-synchronous', path: ['shape'] } })
  const d: StatefulBlockDescriptor<'suite.state', unknown, unknown> = {
    ...declaration(),
    key: 'suite.state',
    kind: 'stateful',
    writers: ['tool'],
    reduce: () => 1,
    persistence: 'checkpointed',
    singleWriterPerStep: false,
    updateSchema: asyncSchema,
  }
  const result = reduceStep({
    scope: scope('async'),
    step: { step: 'one' },
    updates: [{ key: 'suite.state', origin: { origin: 'one' }, writer: 'tool', update: 1 }],
    descriptors: { get: () => d },
    current: () => undefined,
  })
  expect(result.rejected[0]?.rejection).toEqual({
    kind: 'definition',
    reason: 'schema-not-synchronous',
    path: ['updateSchema'],
  })
})
