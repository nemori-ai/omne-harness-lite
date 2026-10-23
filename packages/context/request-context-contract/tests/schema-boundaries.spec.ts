import { expect, it } from 'vitest'
import {
  compactionPlanSchema,
  planCompaction,
  compactionPolicySchema,
  compactionSettingsSchema,
  windowUsageSchema,
  representationPolicyConfigSchema,
  planProgressSchema,
} from '@omne-harness/request-context-contract'
import { fixture, adoption, evidence } from './fixtures.js'
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
    { stepBound: '1' },
    { trimFirst: false, stepBound: '0' },
  ])
    expect(compactionPolicySchema['~standard'].validate({ ...policy, ...change })).toHaveProperty(
      'issues',
    )
})
it('required block schemas compose policy validation and keep their own failure diagnostics', () => {
  const settings = { ...policy, policy: adoption }
  expect(compactionSettingsSchema['~standard'].validate(settings)).toEqual({ value: settings })
  for (const value of [
    { ...settings, policy: { ...adoption, digest: 4 } },
    { ...settings, stepBound: '1' },
  ])
    expect(compactionSettingsSchema['~standard'].validate(value)).toEqual({
      issues: [{ path: [], message: 'Invalid compaction settings' }],
    })
  const usage = { candidate: 'candidate:one', usedTokens: '0', windowTokens: '0', ratio: '1' }
  expect(windowUsageSchema['~standard'].validate(usage)).toEqual({ value: usage })
  for (const change of [
    { candidate: '' },
    { usedTokens: '-1' },
    { windowTokens: 2 },
    { ratio: '1.01' },
  ])
    expect(windowUsageSchema['~standard'].validate({ ...usage, ...change })).toEqual({
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

it('plan decoding keeps floor containment and retained uniqueness without strengthening the schema', async () => {
  const f = fixture()
  const planned = await planCompaction(f.input, f.ports, f.policies)
  if (planned.kind !== 'planned') throw new Error(planned.kind)
  const plan = planned.plan
  expect(compactionPlanSchema['~standard'].validate(plan)).toEqual({ value: plan })
  for (const change of [
    { retained: [plan.covers.from, plan.covers.from] },
    { retained: [], floor: [plan.covers.from] },
    { covers: { from: '', to: plan.covers.to } },
    { after: [{}] },
    { candidate: '' },
    { bound: '0' },
    { shape: 'unknown' },
  ])
    expect(compactionPlanSchema['~standard'].validate({ ...plan, ...change })).toHaveProperty(
      'issues',
    )
  const duplicateFloor = {
    ...plan,
    retained: [plan.covers.from],
    floor: [plan.covers.from, plan.covers.from],
  }
  expect(compactionPlanSchema['~standard'].validate(duplicateFloor)).toEqual({
    value: duplicateFloor,
  })
})
