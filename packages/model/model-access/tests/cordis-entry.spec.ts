import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createModelAccessPlugin } from '@omne-harness/model-access/cordis'
import { modelProtocol, type ModelProtocol } from '@omne-harness/model-protocol'
import { expect, it } from 'vitest'
import { createWorld, fixtureLogin, loginIdentity, REQUIRED } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<ModelProtocol>[] = []
  readonly unmounted: AccessContribution<ModelProtocol>[] = []
  protected attach(contribution: never) {
    this.mounted.push(contribution)
    return async () => {
      this.unmounted.push(contribution)
    }
  }
}

const ALICE = fixtureLogin('a')
const signal = new AbortController().signal

async function assemble() {
  const world = createWorld()
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const plugin = await root.plugin(
    createModelAccessPlugin({ principals: () => world.principals, profiles: world.profiles }),
    { required: REQUIRED },
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  const contribution = registry.mounted[0]
  if (contribution === undefined) throw new Error('nothing was mounted')
  const list = () =>
    contribution.operations['list-models'](
      { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
      { tenant: ALICE.tenant },
    )
  return { world, plugin, registry, contribution, list }
}

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/model-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createModelAccessPlugin'])
})

it('mounts model/v1 with its one operation and no observation', async () => {
  const { registry, contribution } = await assemble()
  expect(registry.mounted).toHaveLength(1)
  expect(contribution.protocol).toBe(modelProtocol)
  expect(Object.keys(contribution.operations)).toEqual(['list-models'])
  expect(Object.keys(contribution.observations)).toEqual([])
})

it('hands the plugin settings to the handler: the requirement a listed model is judged by', async () => {
  const { list, world } = await assemble()
  expect((await list()).outcome).toBe('succeeded')
  expect(world.listed[0]?.required).toEqual(REQUIRED)
})

it('answers basis-unavailable while Model is off, and the protocol stays mounted', async () => {
  const { list, world, registry } = await assemble()
  world.state.present = false
  expect(await list()).toEqual({ outcome: 'basis-unavailable' })
  expect(registry.mounted).toHaveLength(1)
  expect(registry.unmounted).toHaveLength(0)
})

it('takes the contribution down with the plugin', async () => {
  const { plugin, registry, contribution } = await assemble()
  await plugin.dispose()
  expect(registry.unmounted).toEqual([contribution])
})
