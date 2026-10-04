import { describe, expect, it, vi } from 'vitest'
import { type Context, type Fiber } from '@deepseek-ai/cordis'
import type { MembershipsService } from '@omne-harness-lite/organization-governance'
import {
  MEMBERSHIPS_SERVICE,
  ORGANIZATIONS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { organizationGovernancePlugin } from '../src/cordis.ts'
import { bootOg, registeredUser } from './support.ts'

// Real file-backed SQL provider. Only account/login sources use the existing stand-ins.
describe('public consumer across a SQL provider generation', () => {
  it('disposes the consumer effect, reruns once, and recognizes committed membership', async () => {
    const h = await bootOg()
    let replacement: Fiber | undefined
    let consumer: Fiber | undefined
    const observations: unknown[] = []
    let disposals = 0
    try {
      const user = await registeredUser(h)
      const previous = h.assembly.fibers.at(-1)!
      const originalConfig = previous.config
      consumer = await h.assembly.ctx.plugin({
        name: 'public-membership-consumer',
        inject: [MEMBERSHIPS_SERVICE],
        async apply(ctx: Context) {
          const memberships = ctx.get(MEMBERSHIPS_SERVICE) as MembershipsService
          ctx.effect(() => () => {
            disposals++
          })
          observations.push(await memberships.standing(user.personal))
        },
      })
      expect(observations).toEqual([{ standing: 'effective', role: 'superAdministrator' }])
      await previous.dispose()
      await vi.waitFor(() => expect(disposals).toBe(1))
      for (const key of [
        MEMBERSHIPS_SERVICE,
        ORGANIZATIONS_SERVICE,
        OFFERS_SERVICE,
        ORGANIZATION_PURGE_SERVICE,
      ]) {
        expect(h.assembly.ctx.get(key), key).toBeUndefined()
      }
      expect(consumer.state as number).toBe(FIBER_STATE.PENDING)
      replacement = await h.assembly.ctx.plugin(organizationGovernancePlugin, originalConfig)
      await vi.waitFor(() => expect(observations).toHaveLength(2))
      expect(consumer.state as number).toBe(FIBER_STATE.ACTIVE)
      expect(observations).toEqual([
        { standing: 'effective', role: 'superAdministrator' },
        { standing: 'effective', role: 'superAdministrator' },
      ])
      for (const key of [
        MEMBERSHIPS_SERVICE,
        ORGANIZATIONS_SERVICE,
        OFFERS_SERVICE,
        ORGANIZATION_PURGE_SERVICE,
      ]) {
        expect(h.assembly.ctx.get(key), key).toBeDefined()
      }
      await consumer.dispose()
      expect(disposals).toBe(2)
      expect(h.assembly.ctx.get(MEMBERSHIPS_SERVICE)).toBeDefined()
    } finally {
      await consumer?.dispose()
      await replacement?.dispose()
      await h.dispose()
    }
  })
})
