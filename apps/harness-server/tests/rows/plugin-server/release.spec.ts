import type { Context } from '@deepseek-ai/cordis'
import { scopeOfLayer } from '@omne-harness/assets'
import { declare, list, type Contract } from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'
import {
  pluginServerKey,
  type PluginServerService,
} from '../../../src/rows/plugin-server/service.ts'

const LABELS: Contract = {
  title: 'test',
  name: 'notes.labels',
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of a label',
  gives: 'nothing',
  item: { kind: 'data', fields: {} },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'nothing',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'The labels of notes.',
}

const manifest = (colour: string) =>
  JSON.stringify({
    schema: 1,
    name: 'tidy',
    summary: 'Labels notes.',
    server: { members: [{ point: 'notes.labels', key: 'urgent', data: { colour } }] },
  })

describe('the server loads what a tenant holds, on the release tree', () => {
  it(
    'a data member for a point of the server tree is put in the scope of its tenant by the server, shows as loaded, and leaves when the plugin is disabled',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const tenantText = savedTenant(tree.home)
        const tenant = tenantOf(tenantText)
        const assets = tree.clients.assets
        const point = tree.scope.plugin({
          name: 'test-labels',
          inject: [dynamisKey],
          apply: (ctx: Context) =>
            void (ctx.get(dynamisKey) as DynamisService).put([declare(LABELS)]),
        })
        await point.await()
        const registry = () => (tree.scope.get(dynamisKey) as DynamisService).registry()
        const labels = (scope: readonly string[]) => {
          const read = list<{ colour: string }>(registry(), 'notes.labels', null, [...scope])
          return read.kind === 'read' ? read.items.map(({ entry }) => entry) : []
        }
        const states = () =>
          (tree.scope.get(pluginServerKey) as PluginServerService).states(tenantText)
        const mine = scopeOfLayer('tenant', tenantText)

        const made = await uploadPlugin(assets, tenant, 'tidy', { 'plugin.json': manifest('red') })
        if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
        await until(() => labels(mine).length === 1, 'the label to be put', 20_000)
        expect(labels(mine)).toMatchObject([
          { point: 'notes.labels', key: 'urgent', scope: mine, item: { colour: 'red' } },
        ])
        expect(labels([])).toEqual([])
        expect(labels(scopeOfLayer('tenant', 'another'))).toEqual([])
        expect(states()?.get('tidy')?.kind).toBe('loaded')

        const again = await uploadPlugin(
          assets,
          tenant,
          'tidy',
          { 'plugin.json': manifest('green') },
          'up-tidy-2',
        )
        if (again.outcome !== 'succeeded') throw new Error(JSON.stringify(again))
        await until(
          () => labels(mine)[0]?.item.colour === 'green',
          'the new version to replace the label',
          20_000,
        )
        expect(labels(mine)).toHaveLength(1)

        const off = await assets['set-asset-enabled']({
          tenant,
          operation: 'off-1',
          holding: again.body.holding,
          enabled: false,
        })
        expect(off.outcome).toBe('succeeded')
        await until(() => labels(mine).length === 0, 'the label to leave', 20_000)
        expect(states()?.has('tidy')).toBe(false)
        await point.dispose()
      })
      expect(exitCode).toBe(0)
    },
  )
})
