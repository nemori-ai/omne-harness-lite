import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createHitlAccessPlugin } from '@omne-harness/human-intervention-access/cordis'
import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import { expect, it } from 'vitest'
import { bodyOf, as } from './fixtures/wire.ts'
import { createWorld, fixtureLogin } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<HumanInterventionProtocol>[] = []
  protected attach(contribution: never) {
    this.mounted.push(contribution)
    return async () => {}
  }
}

const ALICE = fixtureLogin('a')

async function mount(faces: boolean) {
  const world = createWorld()
  const root = new Context()
  await root.plugin(RecordingRegistry)
  await root.plugin(
    createHitlAccessPlugin({
      faces: () => (faces ? world.hitl.faces : undefined),
      entryPrincipals: () => world.holder.holder,
      logins: () => ({ admits: async () => 'admitted' }),
      changes: () => world.signals.changes,
    }),
    { locationRef: 'configured-location' },
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  return { world, registry }
}

const list = {
  tenant: ALICE.tenantText,
  filter: { states: ['pending'] },
  cursor: null,
  limit: 20,
}

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/human-intervention-access/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis)).toEqual(['createHitlAccessPlugin'])
})

it('mounts human-intervention/v1 with its four operations and its observation, and the location comes from the settings', async () => {
  const { world, registry } = await mount(true)
  expect(registry.mounted).toHaveLength(1)
  const contribution = registry.mounted[0]!
  expect(contribution.protocol).toBe(humanInterventionProtocol)
  expect(Object.keys(contribution.operations).sort()).toEqual(
    Object.keys(humanInterventionProtocol.operations).sort(),
  )
  expect(Object.keys(contribution.observations)).toEqual(['observe-cards'])
  const answer = await contribution.operations['list-cards'](
    as(ALICE) as never,
    bodyOf('list-cards', list),
  )
  expect(answer.outcome).toBe('succeeded')
  expect(world.hitl.calls[0]?.input).toMatchObject({ locationRef: 'configured-location' })
  const observed = await contribution.observations['observe-cards'](
    as(ALICE) as never,
    {
      tenant: ALICE.tenant,
    } as never,
  )
  expect(observed.outcome).toBe('succeeded')
  expect(world.signals.subscribed).toEqual([ALICE.tenantText])
})

it('answers basis-unavailable while the faces are absent, with the protocol still mounted', async () => {
  const { registry } = await mount(false)
  const contribution = registry.mounted[0]!
  const answer = await contribution.operations['list-cards'](
    as(ALICE) as never,
    bodyOf('list-cards', list),
  )
  expect(answer).toEqual({ outcome: 'basis-unavailable' })
})
