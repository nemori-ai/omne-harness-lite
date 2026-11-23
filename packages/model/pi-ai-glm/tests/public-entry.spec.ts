import { expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import { FAMILY } from './support/glm.ts'
import { GLM_OWNER, GLM_RECORDS, officialGlmProfiles } from '../src/index.ts'

const expected = [
  'z-ai/glm-5.1',
  'z-ai/glm-5.2',
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'z-ai/glm-5.3-flashx',
  'z-ai/glm-5.3-flashx-legal',
  'z-ai/glm-5.3-prime',
]
const input = {
  retryPolicy: { owner: 'test', name: 'retry', revision: '1', digest: 'f'.repeat(64) },
  compactionTriggerPercent: '80',
}

it('publishes one current official profile per named route with a fixed supplier', () => {
  const profiles = officialGlmProfiles(input)
  expect(profiles.map(profile => profile.suppliers[0].model).toSorted()).toEqual(expected)
  for (const profile of profiles) {
    expect(profile.fallback).toBe(false)
    expect(profile.suppliers).toHaveLength(1)
    const [supplier] = profile.suppliers
    expect(supplier.provider).toBe('openrouter')
    expect(supplier.adoption.owner).toBe('@omne-harness/pi-ai-glm')
    const current = GLM_RECORDS.find(r => r.name === supplier.model && r.status === 'current')
    expect(current?.revision).toBe(supplier.adoption.revision)
  }
})

const png = {
  storage: 'test',
  key: 'picture',
  mediaType: 'image/png',
  bytes: '99',
  digest: 'picture',
}
const expectedImages = ['z-ai/glm-5.3-flash', 'z-ai/glm-5.3-flashx', 'z-ai/glm-5.3-flashx-legal']
it('exposes every current route through the release profile and binds its exact adoption without a credential', async () => {
  const profiles = officialGlmProfiles(input)
  expect(profiles).toHaveLength(7)
  expect(new Set(profiles.map(p => p.suppliers[0].model)).size).toBe(7)
  const family = composeFamilies([FAMILY])
  for (const record of GLM_RECORDS.filter(r => r.status === 'current')) {
    const adoption = recordAdoption(GLM_OWNER, record)
    const profile = profiles.find(p => p.suppliers[0].model === record.route.model)
    if (!profile) throw Error('missing current profile: ' + record.name)
    const supplier = profile.suppliers[0]
    const image = expectedImages.includes(record.name)
    expect(profile.input).toEqual(image ? ['text', 'image'] : ['text'])
    expect(profile).toMatchObject({
      fallback: false,
      context: { compactionTriggerPercent: '80' },
      retryPolicy: input.retryPolicy,
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
    expect(() => officialGlmProfiles({ ...input, compactionTriggerPercent })).toThrow(RangeError)
})
