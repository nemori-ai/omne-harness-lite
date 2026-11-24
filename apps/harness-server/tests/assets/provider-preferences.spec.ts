import type { Context } from '@deepseek-ai/cordis'
import { decodeProviderName } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import { createProviderPreferences } from '../../src/assets/provider-preferences.ts'
import { tenantAssetSettingsKey } from '../../src/rows/governance/tenant-settings-service.ts'

const openrouter = (() => {
  const decoded = decodeProviderName('openrouter')
  if (!('ok' in decoded)) throw new Error('provider name')
  return decoded.ok
})()
const access = { principal: { subject: 'test' }, tenant: 'tenant' } as never

type View = Readonly<{
  owner: Readonly<{ kind: 'asset'; category: string; name: string }>
  item: string
  kind: 'ordinary' | 'secret'
  effective?: Readonly<{ value: Readonly<{ kind: 'set'; value: unknown } | { kind: 'unset' }> }>
}>

type Query = Readonly<{ tenant: string; category: string }>

// The settings answer only the query the adapter must make: this tenant, the provider category.
function ctxWith(items: (() => Promise<readonly View[] | 'unknown'>) | undefined): Context {
  const service =
    items === undefined
      ? undefined
      : {
          items: async (query: Query) =>
            query.tenant === 'tenant' && query.category === 'model-provider' ? items() : [],
        }
  return { get: (key: string) => (key === tenantAssetSettingsKey ? service : undefined) } as never
}

const view = (item: string, value?: unknown, name = 'openrouter'): View => ({
  owner: { kind: 'asset', category: 'model-provider', name },
  item,
  kind: 'ordinary',
  effective: { value: value === undefined ? { kind: 'unset' } : { kind: 'set', value } },
})

const read = (ctx: Context) => createProviderPreferences(ctx).read({ provider: openrouter, access })

describe('the preferences a tenant holds on a release provider (C4, C6)', () => {
  it('without values each model is as the release enables it', async () => {
    const answer = await read(
      ctxWith(async () => [view('model-switches'), view('model-reasoning-efforts')]),
    )
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    expect(answer.ok.enabled.size).toBe(25)
    expect(answer.ok.enabled.has('openai/gpt-6.1-sol')).toBe(true)
    expect(answer.ok.efforts.size).toBe(0)
  })

  it('takes the tenant’s switches and efforts, and only for this provider', async () => {
    const answer = await read(
      ctxWith(async () => [
        view('model-switches', { 'openai/gpt-6.1-sol': false, 'moonshotai/kimi-k3': true }),
        view('model-reasoning-efforts', { 'anthropic/claude-opus-5.5': 'high' }),
        view('model-switches', { 'anthropic/claude-opus-5.5': false }, 'elsewhere'),
      ]),
    )
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    expect(answer.ok.enabled.has('openai/gpt-6.1-sol')).toBe(false)
    expect(answer.ok.enabled.has('moonshotai/kimi-k3')).toBe(true)
    expect(answer.ok.enabled.has('anthropic/claude-opus-5.5')).toBe(true)
    expect([...answer.ok.efforts]).toEqual([['anthropic/claude-opus-5.5', 'high']])
  })

  it('is unavailable when the settings cannot be read, or the tenant does not hold them yet', async () => {
    expect(await read(ctxWith(undefined))).toEqual({ failure: { kind: 'unavailable' } })
    expect(await read(ctxWith(async () => 'unknown'))).toEqual({ failure: { kind: 'unavailable' } })
    expect(await read(ctxWith(async () => []))).toEqual({ failure: { kind: 'unavailable' } })
    expect(
      await read(ctxWith(async () => [{ ...view('model-switches'), kind: 'secret' }])),
    ).toEqual({ failure: { kind: 'unavailable' } })
  })

  it('is unavailable for a provider the release does not bring', async () => {
    const other = decodeProviderName('elsewhere')
    if (!('ok' in other)) throw new Error('provider name')
    const answer = await createProviderPreferences(
      ctxWith(async () => [view('model-switches', undefined, 'elsewhere')]),
    ).read({ provider: other.ok, access })
    expect(answer).toEqual({ failure: { kind: 'unavailable' } })
  })
})
