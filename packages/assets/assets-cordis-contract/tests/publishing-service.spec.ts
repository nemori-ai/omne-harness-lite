import { Context, type Plugin } from '@deepseek-ai/cordis'
import type { TenantPublishing, TenantPublishRequest } from '@omne-harness/assets'
import { assetPublishingKey } from '@omne-harness/assets-cordis-contract'
import { AssetPublishingService } from '@omne-harness/assets-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

describe('the publish service on a real Cordis root', () => {
  it('a plugin that injects assetPublishing reaches the provider’s publishing, and loses it when the provider unloads', async () => {
    const asked: unknown[] = []
    const publishing: TenantPublishing<unknown> = {
      async publish(request) {
        asked.push(request.operationId)
        return { kind: 'denied' }
      },
    }
    const root = new Context()
    const provider = root.plugin({
      name: 'provider',
      apply(ctx: Context) {
        new AssetPublishingService(ctx, publishing)
      },
    } satisfies Plugin.Object)
    await provider.await()
    let answer: unknown
    const consumer = root.plugin({
      name: 'consumer',
      inject: [assetPublishingKey],
      async apply(ctx: Context) {
        answer = await ctx.assetPublishing.publish({
          operationId: 'publish-1',
        } as TenantPublishRequest<unknown>)
      },
    } satisfies Plugin.Object)
    await consumer.await()
    expect(answer).toEqual({ kind: 'denied' })
    expect(asked).toEqual(['publish-1'])
    await provider.dispose()
    expect(root.get(assetPublishingKey)).toBeUndefined()
  })
})
