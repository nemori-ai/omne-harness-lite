import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { OrganizationPurge, ORGANIZATION_PURGE_SERVICE } from '../src/cordis.ts'
import type { OrganizationPurgeService } from '../src/index.ts'

// Mechanism probe only. This is not a governance business implementation.
class ProbePurge extends OrganizationPurge {
  entries = new Set<string>()
  purgePersonalOrganization: OrganizationPurgeService['purgePersonalOrganization'] =
    async function (this: ProbePurge) {
      this.ctx.effect(() => {
        this.entries.add('caller')
        return () => {
          this.entries.delete('caller')
        }
      })
      return { failure: 'unavailable' }
    }
}

describe('public governance Service definition', () => {
  it('binds effects to the caller and service visibility to the provider', async () => {
    const ctx = new Context()
    const provider = await ctx.plugin({
      name: 'n4-public-definition-probe',
      apply(inner: Context) {
        new ProbePurge(inner)
      },
    })
    const consumer = await ctx.plugin({
      name: 'n4-public-definition-consumer',
      inject: [ORGANIZATION_PURGE_SERVICE],
      async apply(inner: Context) {
        await (inner.get(ORGANIZATION_PURGE_SERVICE) as ProbePurge).purgePersonalOrganization(
          undefined,
        )
      },
    })
    const service = ctx.get(ORGANIZATION_PURGE_SERVICE) as ProbePurge
    try {
      expect(service.entries.has('caller')).toBe(true)
      await consumer.dispose()
      expect(service.entries.has('caller')).toBe(false)
      expect(provider.state as number).toBe(FIBER_STATE.ACTIVE)
      expect(ctx.get(ORGANIZATION_PURGE_SERVICE)).toBeDefined()
    } finally {
      await consumer.dispose()
      await provider.dispose()
    }
    expect(ctx.get(ORGANIZATION_PURGE_SERVICE)).toBeUndefined()
  })
})
