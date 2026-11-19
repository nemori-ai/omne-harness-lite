import { Context, type Plugin } from '@deepseek-ai/cordis'
import type { TenantManagement } from '@omne-harness/assets'
import { assetChangesKey, assetManagementKey } from '@omne-harness/assets-cordis-contract'
import {
  AssetChangesService,
  AssetManagementService,
  type AssetChangeListener,
} from '@omne-harness/assets-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

describe('the management and change services on a real Cordis root', () => {
  it('a plugin that injects assetManagement reaches the provider’s service, and loses it when the provider unloads', async () => {
    const management = {
      list: async () => ({ kind: 'denied' }),
    } as unknown as TenantManagement<unknown>
    const root = new Context()
    const provider = root.plugin({
      name: 'provider',
      apply(ctx: Context) {
        new AssetManagementService(ctx, management)
      },
    } satisfies Plugin.Object)
    await provider.await()
    let answer: unknown
    const consumer = root.plugin({
      name: 'consumer',
      inject: [assetManagementKey],
      async apply(ctx: Context) {
        answer = await ctx.assetManagement.management.list({
          tenant: 't',
          principal: undefined,
          category: 'skill',
          after: null,
          limit: 1,
        })
      },
    } satisfies Plugin.Object)
    await consumer.await()
    expect(answer).toEqual({ kind: 'denied' })
    await provider.dispose()
    expect(root.get(assetManagementKey)).toBeUndefined()
  })

  it('a subscription through assetChanges reaches the provider’s feed, and its release is the feed’s', async () => {
    const subscribed: string[] = []
    let released = 0
    const root = new Context()
    const provider = root.plugin({
      name: 'provider',
      apply(ctx: Context) {
        new AssetChangesService(ctx, {
          subscribe(tenant: string, _listener: AssetChangeListener) {
            subscribed.push(tenant)
            return () => {
              released += 1
            }
          },
        })
      },
    } satisfies Plugin.Object)
    await provider.await()
    const release = root.get(assetChangesKey)?.subscribe('tenant-a', {
      changed: () => {},
      closed: () => {},
    })
    expect(subscribed).toEqual(['tenant-a'])
    release?.()
    expect(released).toBe(1)
    await provider.dispose()
    expect(root.get(assetChangesKey)).toBeUndefined()
  })
})
