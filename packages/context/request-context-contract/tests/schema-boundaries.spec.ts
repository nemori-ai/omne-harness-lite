import { expect, it } from 'vitest'
import {
  compactionPolicySchema,
  compactionSettingsSchema,
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
it('the compaction settings schema composes policy validation and keeps its own failure diagnostic', () => {
  const settings = { ...policy, policy: adoption }
  expect(compactionSettingsSchema['~standard'].validate(settings)).toEqual({ value: settings })
  for (const value of [
    { ...settings, policy: { ...adoption, digest: 4 } },
    { ...settings, stepBound: '0' },
  ])
    expect(compactionSettingsSchema['~standard'].validate(value)).toEqual({
      issues: [{ path: [], message: 'Invalid compaction settings' }],
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
