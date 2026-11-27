import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { officialProfileAdoption } from '@omne-harness/model-host-local'
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

const DECISION_ROUTES = ['openai/gpt-6-luna-decisions', 'typesafe/jev-1.13', 'typesafe/jev-1.14']

describe('the official send sources', () => {
  it('name every official profile of the release families with the adoption the real profiles plugin resolves, and are official', async () => {
    const sources = officialSendSources({
      profiles: PROFILES,
      current: () => ({ ok: { authorized: false } }),
    })
    const routes = [...new Set(sources.map(source => source.model))]
    const families = new Set(sources.map(source => source.model.split('/')[0]))
    expect(families).toEqual(
      new Set(['openai', 'anthropic', 'qwen', 'moonshotai', 'deepseek', 'z-ai', 'typesafe']),
    )
    expect(routes.filter(model => /^(deepseek|moonshotai|z-ai)\//.test(model)).toSorted()).toEqual([
      'deepseek/deepseek-v3.2',
      'deepseek/deepseek-v3.2-exp',
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v4-flash-0731',
      'deepseek/deepseek-v4-flash-vision-exp',
      'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-v4-pro-0813',
      'deepseek/deepseek-v4.1-flash',
      'deepseek/deepseek-v4.1-flash-1017',
      'moonshotai/kimi-k2.7-code',
      'moonshotai/kimi-k3',
      'moonshotai/kimi-k3.1-pro',
      'z-ai/glm-5.1',
      'z-ai/glm-5.2',
      'z-ai/glm-5.3',
      'z-ai/glm-5.3-flash',
      'z-ai/glm-5.3-flashx',
      'z-ai/glm-5.3-flashx-legal',
      'z-ai/glm-5.3-prime',
    ])
    const ctx = new Context()
    await ctx.plugin(ModelProfilesLocalPlugin, { ...PROFILES, updatedAt: '2026-11-02T00:00:00Z' })
    const profiles = ctx.get(modelProfilesKey) as ModelProfiles<unknown>
    const access = { principal: Object.freeze({ subject: 'test' }), tenant: fixtureTenant('a') }
    const decisionRoutes = routes.filter(route => DECISION_ROUTES.includes(route))
    expect(decisionRoutes.toSorted()).toEqual(DECISION_ROUTES)
    for (const route of decisionRoutes) {
      const judged = await profiles.resolve({
        ...access,
        kind: 'decisions',
        route,
        required: REQUIRED,
      })
      if (!('ok' in judged) || judged.ok.kind !== 'resolved')
        throw new Error(`${route}: not resolved`)
      const [supplier] = judged.ok.profile.definition.suppliers
      expect(sources.filter(source => source.model === route)).toEqual([
        expect.objectContaining({
          profile: judged.ok.profile.adoption,
          supplier: supplier.adoption,
          provider: supplier.provider,
          official: true,
        }),
      ])
    }
    for (const route of routes.filter(route => !DECISION_ROUTES.includes(route))) {
      const matching = sources.filter(source => source.model === route)
      const resolved = await profiles.resolve({
        principal: Object.freeze({ subject: 'test' }),
        tenant: fixtureTenant('a'),
        kind: 'llm',
        route,
        required: REQUIRED,
      })
      expect(resolved, route).toHaveProperty('ok')
      if (!('ok' in resolved) || resolved.ok.kind !== 'resolved') throw new Error('not resolved')
      const { reasoningEfforts, ...previous } = resolved.ok.profile.definition
      expect(reasoningEfforts).toBeDefined()
      expect(matching.map(source => source.profile)).toEqual([
        resolved.ok.profile.adoption,
        officialProfileAdoption(previous),
      ])
      for (const source of matching) {
        expect(source.supplier).toEqual(resolved.ok.profile.definition.suppliers[0].adoption)
        expect(source.provider).toBe(resolved.ok.profile.definition.suppliers[0].provider)
        expect(source.official).toBe(true)
      }
      expect(matching[0]?.current).toBe(matching[1]?.current)
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
      kind: 'llm',
      route: 'qwen/qwen3.8-omni-flash',
      required: { ...REQUIRED, modalities: ['text', 'voice'] },
    })
    if (!('ok' in resolved) || resolved.ok.kind !== 'resolved') throw new Error('not resolved')
    expect(resolved.ok.profile.definition.input).toEqual(['text', 'voice'])
    await ctx.fiber.dispose()
  })
})
