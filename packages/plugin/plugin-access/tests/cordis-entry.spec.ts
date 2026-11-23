import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createPluginAccessPlugin } from '@omne-harness/plugin-access/cordis'
import { pluginProtocol, type PluginProtocol } from '@omne-harness/plugin-protocol'
import { expect, it } from 'vitest'
import { createPluginReports } from '../src/reports.ts'
import { fixtureLogin, loginIdentity } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<PluginProtocol>[] = []
  readonly unmounted: AccessContribution<PluginProtocol>[] = []
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
  const asked: string[] = []
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const plugin = await root.plugin(
    createPluginAccessPlugin({
      principals: () => ({
        async actingFor(_login, tenant) {
          asked.push(tenant)
          return { ok: {} as never }
        },
      }),
      source: () => ({
        list: async () => ({ kind: 'read', offered: [] }),
        read: async () => ({ kind: 'unavailable' }),
        subscribe: () => () => undefined,
      }),
      reports: () => createPluginReports({ perTenant: 8 }),
    }),
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  return { registry, plugin, asked }
}

it('exports the plugin factory only', async () => {
  const cordis = (await import('@omne-harness/plugin-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createPluginAccessPlugin'])
})

it('mounts plugin/v1 on the registry of the tree, and takes it down with the plugin', async () => {
  const { registry, plugin, asked } = await assemble()
  expect(registry.mounted.map(contribution => contribution.protocol)).toEqual([pluginProtocol])
  const listed = await registry.mounted[0]!.operations['list-wanted'](
    { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
    { tenant: ALICE.tenant, side: 'client' },
  )
  expect(listed).toEqual({ outcome: 'succeeded', body: { plugins: [] } })
  expect(asked).toEqual([ALICE.tenantText])
  await plugin.dispose()
  expect(registry.unmounted).toEqual(registry.mounted)
})
