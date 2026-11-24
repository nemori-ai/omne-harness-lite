import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createMediaAccessPlugin } from '@omne-harness/media-access/cordis'
import { mediaProtocol, type MediaProtocol } from '@omne-harness/media-protocol'
import { expect, it } from 'vitest'
import type { MediaFace } from '../src/ports.ts'
import { fixtureLogin, loginIdentity } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<MediaProtocol>[] = []
  readonly unmounted: AccessContribution<MediaProtocol>[] = []
  mount(contribution: never): void {
    this.ctx.effect(() => {
      this.mounted.push(contribution)
      return () => void this.unmounted.push(contribution)
    }, 'test.mount')
  }
}

const ALICE = fixtureLogin('a')
const signal = new AbortController().signal

async function assemble() {
  let face: MediaFace | undefined
  const asked: string[] = []
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const plugin = await root.plugin(
    createMediaAccessPlugin({
      principals: () => ({
        async actingFor(_login, tenant) {
          asked.push(tenant)
          return { ok: {} as never }
        },
      }),
      media: () => face,
    }),
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  const query = () => {
    const contribution = registry.mounted[0]
    if (contribution === undefined) throw new Error('nothing was mounted')
    return contribution.operations['query-upload'](
      { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
      { tenant: ALICE.tenant, upload: 'up-1' },
    )
  }
  return { registry, plugin, query, asked, load: (next: MediaFace | undefined) => (face = next) }
}

it('exports the plugin factory only', async () => {
  const cordis = (await import('@omne-harness/media-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createMediaAccessPlugin'])
})

it('mounts media/v1 on the registry of the tree, and takes it down with the plugin', async () => {
  const { registry, plugin } = await assemble()
  expect(registry.mounted.map(contribution => contribution.protocol)).toEqual([mediaProtocol])
  await plugin.dispose()
  expect(registry.unmounted).toEqual(registry.mounted)
})

it('takes the media face at each call: absent is basis-unavailable, and it serves once media is there', async () => {
  const { query, load, asked } = await assemble()
  expect(await query()).toEqual({ outcome: 'basis-unavailable' })
  load({
    uploads: { status: async () => ({ failure: { kind: 'not-found' } }) },
  } as unknown as MediaFace)
  expect(await query()).toEqual({ outcome: 'not-found', body: {} })
  load(undefined)
  expect(await query()).toEqual({ outcome: 'basis-unavailable' })
  expect(asked).toEqual([ALICE.tenantText, ALICE.tenantText, ALICE.tenantText])
})
