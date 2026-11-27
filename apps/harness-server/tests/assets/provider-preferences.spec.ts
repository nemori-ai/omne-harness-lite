import type { Context } from '@deepseek-ai/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant as tenantOf,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { decodeProviderName } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import { createProviderPreferences } from '../../src/assets/provider-preferences.ts'
import { tenantAssetSettingsKey } from '../../src/rows/governance/tenant-settings-service.ts'

const openrouter = (() => {
  const decoded = decodeProviderName('openrouter')
  if (!('ok' in decoded)) throw new Error('provider name')
  return decoded.ok
})()
// Account identities of the 26 letters the codec takes; a new object for every reading of the same one.
const LETTERS = 'abcdefghjkmnpqrstvwxyz2345'
function tenantNumbered(n: number): TenantId {
  let tail = ''
  for (let rest = n, place = 0; place < 26; place += 1, rest = Math.floor(rest / 26))
    tail = LETTERS[rest % 26] + tail
  const account = accountCodec.parse(`acc_${tail}`)
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenantOf(organization.value, account.value)
}
const textOf = (tenant: TenantId) => {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : ''
}
const TENANT = textOf(tenantNumbered(0))
const accessOf = (n: number) =>
  ({ principal: { subject: 'test' }, tenant: tenantNumbered(n) }) as never
const access = accessOf(0)

type View = Readonly<{
  owner: Readonly<{ kind: 'asset'; category: string; name: string }>
  item: string
  kind: 'ordinary' | 'secret'
  effective?: Readonly<{ value: Readonly<{ kind: 'set'; value: unknown } | { kind: 'unset' }> }>
}>

type Query = Readonly<{ tenant: TenantId; category: string }>
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
            return textOf(query.tenant) === TENANT && query.category === 'model-provider'
              ? items()
              : []
          },
          writes: (tenant: TenantId) => (textOf(tenant) === TENANT ? writes : -1),
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
    expect(answer.ok.enabled.size).toBe(28)
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

  it('is unavailable when the settings cannot be read (C6)', async () => {
    expect(await read(ctxWith(undefined))).toEqual({ failure: { kind: 'unavailable' } })
    expect(await read(ctxWith(async () => 'unknown'))).toEqual({ failure: { kind: 'unavailable' } })
  })

  it('a tenant that does not hold the settings yet has chosen nothing: the release default', async () => {
    for (const views of [[], [{ ...view('model-switches'), kind: 'secret' as const }]]) {
      const answer = await read(ctxWith(async () => views))
      if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
      expect(answer.ok.enabled.size).toBe(28)
    }
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

  it('keeps the reads of at most 512 tenants, dropping the one read longest ago', async () => {
    const ctx = ctxWith(async () => [view('model-switches')])
    const preferences = createProviderPreferences(ctx)
    const readAs = (n: number) => preferences.read({ provider: openrouter, access: accessOf(n) })
    const others = async (from: number, count: number) => {
      for (let index = from; index < from + count; index += 1) await readAs(index + 1)
    }
    await readAs(0)
    await others(0, 511)
    await readAs(0)
    expect(ctx.settings.reads()).toBe(512)
    ctx.settings.write()
    await readAs(0)
    await others(511, 2)
    await readAs(0)
    expect(ctx.settings.reads()).toBe(515)
    await others(513, 512)
    await readAs(0)
    expect(ctx.settings.reads()).toBe(1028)
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
