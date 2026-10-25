import { expect, it } from 'vitest'
import {
  compactionPlanSchema,
  compactionPolicySchema,
  compactionSettingsSchema,
  windowUsageSchema,
  representationPolicyConfigSchema,
  planProgressSchema,
} from '@omne-harness/request-context-contract'
import { fixture, adoption, evidence, planCompaction } from './fixtures.js'
const policy = {
  retainBudget: { kind: 'ratio', retainRatio: '1' },
  retainPreference: 'newest-first',
  triggerPercent: '100',
  headroomTokens: null,
  trimFirst: true,
  stepBound: '2',
}
it('policy boundaries preserve exact budget and step representations and reject invalid controls', () => {
  expect(compactionPolicySchema['~standard'].validate(policy)).toEqual({ value: policy })
  const tokens = {
    ...policy,
    retainBudget: { kind: 'tokens', retainTokens: '9007199254740993' },
    trimFirst: false,
    stepBound: '1',
  }
  expect(compactionPolicySchema['~standard'].validate(tokens)).toEqual({ value: tokens })
  for (const change of [
    { retainBudget: { kind: 'ratio', retainRatio: '1.01' } },
    { retainBudget: { kind: 'tokens', retainTokens: '1.5' } },
    { retainBudget: { kind: 'unknown' } },
    { retainPreference: 'oldest' },
    { triggerPercent: '100.1' },
    { headroomTokens: '-1' },
    { stepBound: '0' },
    { trimFirst: false, stepBound: '0' },
  ])
    expect(compactionPolicySchema['~standard'].validate({ ...policy, ...change })).toHaveProperty(
      'issues',
    )
  // Trimming is not a step: one summarize step may follow the trim.
  expect(
    compactionPolicySchema['~standard'].validate({ ...policy, stepBound: '1' }),
  ).toHaveProperty('value')
})
it('required block schemas compose policy validation and keep their own failure diagnostics', () => {
  const settings = { ...policy, policy: adoption }
  expect(compactionSettingsSchema['~standard'].validate(settings)).toEqual({ value: settings })
  for (const value of [
    { ...settings, policy: { ...adoption, digest: 4 } },
    { ...settings, stepBound: '0' },
  ])
    expect(compactionSettingsSchema['~standard'].validate(value)).toEqual({
      issues: [{ path: [], message: 'Invalid compaction settings' }],
    })
  const valid = [
    { kind: 'not-fixed' },
    { kind: 'unmeasured', candidate: 'candidate:one', windowTokens: '1000' },
    {
      kind: 'estimate',
      candidate: 'candidate:one',
      usedTokens: '0',
      windowTokens: '1000',
      ratio: '0',
    },
    // A real overflow keeps its ratio above 1, rounded up to six decimals.
    {
      kind: 'actual',
      candidate: 'candidate:one',
      usedTokens: '1001',
      windowTokens: '1000',
      ratio: '1.001',
    },
    {
      kind: 'actual',
      candidate: 'candidate:one',
      usedTokens: '1',
      windowTokens: '3',
      ratio: '0.333334',
    },
  ]
  for (const usage of valid)
    expect(windowUsageSchema['~standard'].validate(usage)).toEqual({ value: usage })
  const usage = valid[3]!
  for (const value of [
    { candidate: 'candidate:one', usedTokens: '1', windowTokens: '3', ratio: '0.333334' },
    { ...usage, candidate: '' },
    { ...usage, usedTokens: '-1' },
    { ...usage, windowTokens: 2 },
    { ...usage, windowTokens: '0' },
    { ...usage, ratio: '1' },
    { kind: 'not-fixed', usedTokens: '0' },
    { kind: 'unmeasured', candidate: 'candidate:one', windowTokens: '1000', usedTokens: '0' },
    { kind: 'unmeasured', candidate: 'candidate:one' },
    { kind: 'missing' },
  ])
    expect(windowUsageSchema['~standard'].validate(value)).toEqual({
      issues: [{ path: [], message: 'Invalid window usage' }],
    })
})
it('representation preferences accept ordered duplicates and reject an unknown choice in every modality', () => {
  const preferences = { text: ['original', 'original'], image: ['derived'], voice: ['transcript'] }
  const value = representationPolicyConfigSchema['~standard'].validate({ preferences })
  expect(value).toEqual({ value: { preferences } })
  if ('value' in value) expect(value.value.preferences.text).not.toBe(preferences.text)
  for (const key of ['text', 'image', 'voice'])
    expect(
      representationPolicyConfigSchema['~standard'].validate({
        preferences: { ...preferences, [key]: ['unknown'] },
      }),
    ).toHaveProperty('issues')
})
it('progress requires contiguous consumption, durable evidence, and exact completed count', () => {
  const consumed = [
    { index: '0', evidence },
    { index: '1', evidence },
  ]
  const value = { planId: 'plan:one', completed: '2', consumed }
  expect(planProgressSchema['~standard'].validate(value)).toEqual({ value })
  for (const change of [
    { completed: '1' },
    { planId: '' },
    {
      consumed: [
        { index: '1', evidence },
        { index: '2', evidence },
      ],
    },
    {
      consumed: [
        { index: '0', evidence },
        { index: '1', evidence: { ...evidence, digest: null } },
      ],
    },
    { consumed: [{ index: '-1', evidence }] },
  ])
    expect(planProgressSchema['~standard'].validate({ ...value, ...change })).toHaveProperty(
      'issues',
    )
})

it('plan decoding keeps the complete basis and rejects an old plan or a tampered basis', async () => {
  const f = fixture()
  const planned = await planCompaction(f.input, f.ports, f.policies)
  if (planned.kind !== 'planned') throw new Error(planned.kind)
  const plan = planned.plan
  expect(compactionPlanSchema['~standard'].validate(plan)).toEqual({ value: plan })
  const { basis: _basis, ...old } = plan
  for (const value of [
    { ...plan, retained: [plan.covers.from, plan.covers.from] },
    { ...plan, covers: { from: '', to: plan.covers.to } },
    { ...plan, candidate: '' },
    { ...plan, bound: '0' },
    { ...plan, shape: 'summarize' },
    { ...plan, shape: { kind: 'trim-then-summarize', trimFirst: true } },
    { ...old, epoch: 'epoch:1', floor: [], after: [] },
    { ...plan, basis: { ...plan.basis, retainedBudget: '7' } },
  ])
    expect(compactionPlanSchema['~standard'].validate(value)).toHaveProperty('issues')
})
