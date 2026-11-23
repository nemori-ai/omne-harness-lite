import { expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import { DEEPSEEK_OWNER, DEEPSEEK_RECORDS, officialDeepSeekProfiles } from '../src/index.ts'
import { FAMILY } from './support/deepseek.ts'

const options = {
  retryPolicy: { owner: 'test', name: 'retry', revision: '1', digest: 'f'.repeat(64) },
  compactionTriggerPercent: '80',
}
const png = {
  storage: 'test',
  key: 'picture',
  mediaType: 'image/png',
  bytes: '99',
  digest: 'picture',
}
const expectedImages = [
  'deepseek/deepseek-v4.1-flash-1017',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4-flash-vision-exp',
]
it('exposes every current route through the release profile and binds its exact adoption without a credential', async () => {
  const profiles = officialDeepSeekProfiles(options)
  expect(profiles).toHaveLength(9)
  expect(new Set(profiles.map(p => p.suppliers[0].model)).size).toBe(9)
  const family = composeFamilies([FAMILY])
  for (const record of DEEPSEEK_RECORDS.filter(r => r.status === 'current')) {
    const adoption = recordAdoption(DEEPSEEK_OWNER, record)
    const profile = profiles.find(p => p.suppliers[0].model === record.route.model)
    if (!profile) throw Error('missing current profile: ' + record.name)
    const supplier = profile.suppliers[0]
    const image = expectedImages.includes(record.name)
    expect(profile.input).toEqual(image ? ['text', 'image'] : ['text'])
    expect(profile).toMatchObject({
      fallback: false,
      context: { compactionTriggerPercent: '80' },
      retryPolicy: options.retryPolicy,
    })
    expect(supplier).toMatchObject({ provider: 'openrouter', model: record.name, adoption })
    const qualified = { ...supplier, credential: { layer: 'official' as const } }
    const bound = await family.acquire(qualified, new AbortController().signal)
    if (!('ok' in bound)) throw Error(JSON.stringify(bound))
    try {
      expect(bound.ok.counting.supplier).toEqual(supplier)
      expect(bound.ok.counting.meter).toEqual(profile.meter)
      expect(bound.ok.adoption).toEqual(adoption)
      const accepted = bound.ok.mediaLimits(png)
      if (image) {
        const limit = profile.limits.find(l => l.metric === 'image-bytes')
        expect(limit).toBeDefined()
        expect(accepted).toMatchObject({
          mediaTypes: ['image/png'],
          maxBytes: Number(limit?.provided),
        })
      } else {
        expect(accepted).toBeNull()
        expect(profile.limits.some(l => l.metric === 'image-bytes')).toBe(false)
      }
    } finally {
      await bound.ok.release()
    }
    const mismatch = await family.acquire(
      { ...qualified, adoption: { ...adoption, digest: 'wrong' } },
      new AbortController().signal,
    )
    expect(mismatch).toHaveProperty('failure')
  }
})
it('rejects invalid compaction settings before publishing profiles', () => {
  for (const compactionTriggerPercent of ['0', '101', '01'])
    expect(() => officialDeepSeekProfiles({ ...options, compactionTriggerPercent })).toThrow(
      RangeError,
    )
})
