import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createNotificationAccessPlugin } from '@omne-harness/notification-access/cordis'
import {
  notificationProtocol,
  type NotificationProtocol,
} from '@omne-harness/notification-protocol'
import { expect, it } from 'vitest'
import { TENANT, bodyOf, person, world } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<NotificationProtocol>[] = []
  mount(contribution: never): void {
    this.ctx.effect(() => {
      this.mounted.push(contribution)
      return () => undefined
    }, 'test.mount')
  }
}

async function mount(present: boolean) {
  const w = world()
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const seen: Context[] = []
  await root.plugin(
    createNotificationAccessPlugin({
      principals: ctx => {
        seen.push(ctx)
        return { actingFor: async () => ({ ok: {} as never }), contextOf: () => w.context as never }
      },
      faces: () => (present ? w.real : undefined),
      changes: () => (present ? w.feed : undefined),
      now: () => w.clock.now(),
    }),
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  return { w, registry, seen }
}

const call = { principal: {}, messageId: 'm-1', signal: new AbortController().signal } as never
const readBeat = () => bodyOf('read-beat', { tenant: TENANT, recipient: person })

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/notification-access/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis)).toEqual(['createNotificationAccessPlugin'])
})

it('the root entry gives the contribution factory and nothing else at run time', async () => {
  const root = (await import('@omne-harness/notification-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createNotificationContribution'])
})

it('mounts notification/v1 with every operation and its observation', async () => {
  const { registry, seen } = await mount(true)
  expect(registry.mounted).toHaveLength(1)
  const contribution = registry.mounted[0]!
  expect(contribution.protocol).toBe(notificationProtocol)
  expect(Object.keys(contribution.operations).sort()).toEqual(
    Object.keys(notificationProtocol.operations).sort(),
  )
  expect(Object.keys(contribution.observations)).toEqual(['observe-changes'])
  expect(seen).toHaveLength(1)
})

it('answers an unavailable basis while the faces are absent, with the protocol still mounted', async () => {
  const { registry } = await mount(false)
  const contribution = registry.mounted[0]!
  expect(await contribution.operations['read-beat'](call, readBeat())).toEqual({
    outcome: 'basis-unavailable',
  })
  const observed = await contribution.observations['observe-changes'](call, {
    tenant: (readBeat() as { tenant: never }).tenant,
  })
  expect(observed).toEqual({ outcome: 'basis-unavailable' })
})
