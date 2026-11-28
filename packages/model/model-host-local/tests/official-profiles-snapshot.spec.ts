import { expect, it } from 'vitest'
import { officialProfiles } from '../src/official-profiles.ts'

// Every official profile, field by field and in release order: a family refactor must leave
// this file byte for byte unchanged. Regenerate it only when a record or profile rule changes.
const INPUT = {
  retryPolicy: {
    owner: '@omne-harness/model-host-local-tests',
    name: 'retry-policy',
    revision: '1',
    digest: '0'.repeat(64),
  },
  compactionTriggerPercent: '80',
} as const

it('keeps every official profile byte for byte', async () => {
  const text = `${JSON.stringify(officialProfiles(INPUT), null, 2)}\n`
  await expect(text).toMatchFileSnapshot('./fixtures/official-profiles.json')
})
