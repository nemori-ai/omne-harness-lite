import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { ModelProfilesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { officialSendSources } from '../../src/model/sources.ts'
import { fixtureTenant } from '../entry/support.ts'

const ADOPTION = {
  owner: 'harness-server-test',
  name: 'retry',
  revision: '1',
  digest: '0'.repeat(64),
}
const PROFILES = { retryPolicy: ADOPTION, compactionTriggerPercent: '80' }
const REQUIRED = {
  modalities: ['text'] as ['text'],
  source: { owner: 'test', record: 'required', revision: '1', digest: '1'.repeat(64) },
}

describe('the official send sources', () => {
  it('name every official profile of the three families with the adoption the real profiles plugin resolves, and are official', async () => {
    const sources = officialSendSources({
      profiles: PROFILES,
      current: () => ({ ok: { authorized: false } }),
    })
    const families = new Set(sources.map(source => source.model.split('/')[0]))
    expect(families).toEqual(new Set(['openai', 'anthropic', 'qwen', 'moonshotai']))
    expect(sources.map(source => source.model)).toEqual(
      expect.arrayContaining([
        'moonshotai/kimi-k3.1-pro',
        'moonshotai/kimi-k3',
        'moonshotai/kimi-k2.7-code',
      ]),
    )
    const ctx = new Context()
    await ctx.plugin(ModelProfilesLocalPlugin, { ...PROFILES, updatedAt: '2026-11-02T00:00:00Z' })
    const profiles = ctx.get(modelProfilesKey) as ModelProfiles<unknown>
    for (const source of sources) {
      const resolved = await profiles.resolve({
        principal: Object.freeze({ subject: 'test' }),
        tenant: fixtureTenant('a'),
        route: source.model,
        required: REQUIRED,
      })
      expect(resolved, source.model).toHaveProperty('ok')
      if (!('ok' in resolved) || resolved.ok.kind !== 'resolved') throw new Error('not resolved')
      expect(source.profile, source.model).toEqual(resolved.ok.profile.adoption)
      expect(source.supplier).toEqual(resolved.ok.profile.definition.suppliers[0].adoption)
      expect(source.provider).toBe(resolved.ok.profile.definition.suppliers[0].provider)
      expect(source.official).toBe(true)
    }
    await ctx.fiber.dispose()
  })

  it('resolve qwen/qwen3.8-omni-flash for a request that needs voice: it takes the speech itself', async () => {
    const ctx = new Context()
    await ctx.plugin(ModelProfilesLocalPlugin, { ...PROFILES, updatedAt: '2026-11-21T00:00:00Z' })
    const profiles = ctx.get(modelProfilesKey) as ModelProfiles<unknown>
    const resolved = await profiles.resolve({
      principal: Object.freeze({ subject: 'test' }),
      tenant: fixtureTenant('a'),
      route: 'qwen/qwen3.8-omni-flash',
      required: { ...REQUIRED, modalities: ['text', 'voice'] },
    })
    if (!('ok' in resolved) || resolved.ok.kind !== 'resolved') throw new Error('not resolved')
    expect(resolved.ok.profile.definition.input).toEqual(['text', 'voice'])
    await ctx.fiber.dispose()
  })
})
