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
type Settings = Readonly<{ reads: () => number; write: () => void }>

// The settings answer only the query the adapter must make: this tenant, the provider category.
function ctxWith(
  items: (() => Promise<readonly View[] | 'unknown'>) | undefined,
): Context & { settings: Settings } {
  let reads = 0
  let writes = 0
  const service =
    items === undefined
      ? undefined
      : {
          items: async (query: Query) => {
            reads += 1
            return query.tenant === 'tenant' && query.category === 'model-provider' ? items() : []
          },
          writes: (tenant: string) => (tenant === 'tenant' ? writes : -1),
        }
  return {
    get: (key: string) => (key === tenantAssetSettingsKey ? service : undefined),
    settings: { reads: () => reads, write: () => (writes += 1) },
  } as never
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

  it('reads the tenant’s settings again only after a write of them', async () => {
    let switches: Record<string, boolean> = { 'openai/gpt-6.1-sol': false }
    const ctx = ctxWith(async () => [view('model-switches', switches)])
    const preferences = createProviderPreferences(ctx)
    const enabled = async () => {
      const answer = await preferences.read({ provider: openrouter, access })
      if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
      return answer.ok.enabled.has('openai/gpt-6.1-sol')
    }
    expect([await enabled(), await enabled(), ctx.settings.reads()]).toEqual([false, false, 1])
    switches = { 'openai/gpt-6.1-sol': true }
    expect(await enabled()).toBe(false)
    ctx.settings.write()
    expect([await enabled(), ctx.settings.reads()]).toEqual([true, 2])
  })

  it('does not keep a read that came back unknown', async () => {
    let answer: 'unknown' | readonly View[] = 'unknown'
    const ctx = ctxWith(async () => answer)
    const preferences = createProviderPreferences(ctx)
    expect(await preferences.read({ provider: openrouter, access })).toEqual({
      failure: { kind: 'unavailable' },
    })
    answer = [view('model-switches')]
    expect(await preferences.read({ provider: openrouter, access })).toHaveProperty('ok')
    expect(ctx.settings.reads()).toBe(2)
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
