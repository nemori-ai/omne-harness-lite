import { expect, it } from 'vitest'
import * as root from '@omne-harness/pi-ai-kimi'

it('the root entry exports the family factory, the profiles, the records and their reasoning format', () => {
  expect(Object.keys(root).toSorted()).toEqual([
    'KIMI_OWNER',
    'KIMI_REASONING_FORMAT',
    'KIMI_RECORDS',
    'createKimiFamily',
    'officialKimiProfiles',
  ])
})

it('offers three native levels on K3 and leaves K2.7 at its model default', () => {
  const profiles = root.officialKimiProfiles({
    retryPolicy: { owner: 'test', name: 'retry', revision: '1', digest: 'f'.repeat(64) },
    compactionTriggerPercent: '80',
  })
  const efforts = Object.fromEntries(profiles.map(p => [p.suppliers[0].model, p.reasoningEfforts]))
  const threeLevels = { low: 'low', medium: 'high', high: 'max' }
  expect(efforts).toEqual({
    'moonshotai/kimi-k2.7-code': {},
    'moonshotai/kimi-k3': threeLevels,
    'moonshotai/kimi-k3.1-pro': threeLevels,
  })
})
