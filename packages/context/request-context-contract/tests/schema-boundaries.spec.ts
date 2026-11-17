import { expect, it } from 'vitest'
import {
  compactionPolicySchema,
  compactionSettingsSchema,
  windowUsageSchema,
  representationPolicyConfigSchema,
} from '@omne-harness/request-context-contract'
import { adoption } from './fixtures.js'
const policy = { triggerPercent: '100', headroomTokens: null }
it('trigger boundaries preserve exact numbers and reject invalid or algorithm controls', () => {
  expect(compactionPolicySchema['~standard'].validate(policy)).toEqual({ value: policy })
  const headroom = { ...policy, headroomTokens: '9007199254740993' }
  expect(compactionPolicySchema['~standard'].validate(headroom)).toEqual({ value: headroom })
  for (const change of [
    { triggerPercent: '100.1' },
    { triggerPercent: '-1' },
    { triggerPercent: 'NaN' },
    { headroomTokens: '-1' },
    { headroomTokens: '1.5' },
    { retainBudget: { kind: 'ratio', retainRatio: '0.16' } },
    { stepBound: '3' },
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
