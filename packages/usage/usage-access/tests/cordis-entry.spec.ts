import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createUsageAccessPlugin } from '@omne-harness/usage-access/cordis'
import { usageProtocol, type UsageProtocol } from '@omne-harness/usage-protocol'
import { expect, it } from 'vitest'
import { BODIES, createWorld, LOGIN } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<UsageProtocol>[] = []
  readonly unmounted: AccessContribution<UsageProtocol>[] = []
  mount(contribution: never): void {
    this.ctx.effect(() => {
      this.mounted.push(contribution)
      return () => void this.unmounted.push(contribution)
    }, 'test.mount')
  }
}

const call = { principal: LOGIN, messageId: 'm-1', signal: new AbortController().signal }

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/usage-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createUsageAccessPlugin'])
})

it('mounts usage/v1 with its three reads, takes the face at each call, and withdraws on unload', async () => {
  const world = createWorld()
  let present = false
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const fork = await root.plugin(
    createUsageAccessPlugin({
      principals: () => world.principals,
      usage: () => (present ? world.face : undefined),
    }),
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  const contribution = registry.mounted[0]
  if (contribution === undefined) throw new Error('nothing was mounted')
  expect(contribution.protocol).toBe(usageProtocol)
  expect(Object.keys(contribution.operations)).toEqual([
    'query-usage',
    'list-usage-records',
    'read-context-occupancy',
  ])
  const read = () =>
    contribution.operations['read-context-occupancy'](call, BODIES['read-context-occupancy'])
  expect(await read()).toEqual({ outcome: 'basis-unavailable' })
  present = true
  world.state.reply = { ok: { kind: 'none-yet' } }
  expect(await read()).toEqual({ outcome: 'succeeded', body: { kind: 'none-yet' } })
  await fork.dispose()
  expect(registry.unmounted).toEqual([contribution])
})
