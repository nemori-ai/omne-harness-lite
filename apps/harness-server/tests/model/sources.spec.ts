// The send sources of the records row (`src/model/sources.ts`) name the official profiles the way
// the real `model-profiles` row publishes them. The adoption digest rule is a copy of the member's
// private rule; this file is the guard: every source's profile adoption equals the adoption the
// real `ModelProfilesLocalPlugin` resolves for that route. A diverging rule turns it red.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { decodeCredentialId } from '@omne-harness/model-contract/provider'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { ModelProfilesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { officialSendSources } from '../../src/model/sources.ts'
import { fixtureTenant, okOf } from '../entry/support.ts'

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
  it('name every official OpenAI profile with the adoption the real profiles plugin resolves, and the factory credential', async () => {
    const sources = officialSendSources({
      profiles: PROFILES,
      factoryQueryId: okOf(decodeCredentialId('factory-openrouter'), 'query id'),
      current: () => ({ ok: { authorized: false, noTenantBinding: true } }),
    })
    expect(sources.length).toBeGreaterThan(0)
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
      expect(source.recipient).toBe(resolved.ok.profile.definition.suppliers[0].recipient)
      expect(source.credential).toEqual({
        kind: 'factory',
        official: true,
        queryId: 'factory-openrouter',
      })
    }
    await ctx.fiber.dispose()
  })
})
