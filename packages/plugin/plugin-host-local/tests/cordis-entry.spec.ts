import { Context } from '@deepseek-ai/cordis'
import { capabilityId } from '@omne-harness/assets'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { pluginCategoryDisplay, skinCategoryDisplay } from '@omne-harness/plugin-host-local'
import { pluginCategory } from '@omne-harness/plugin-host-local/cordis'
import { expect, it } from 'vitest'

it('the cordis entry exports the plugin that registers the category', async () => {
  const cordis = (await import('@omne-harness/plugin-host-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['pluginCategory'])
})

it('contributes its two categories, each with its point, and withdraws them on unload', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  const fiber = root.plugin(pluginCategory())
  await fiber.await()
  const { view } = root.assetCategories
  expect(view.list()).toEqual([
    {
      category: 'plugin',
      display: pluginCategoryDisplay,
      creation: 'directory',
      point: 'plugin.plugins',
    },
    {
      category: 'skin',
      display: skinCategoryDisplay,
      creation: 'directory',
      point: 'plugin.skins',
    },
  ])
  expect(view.atPoint('plugin.plugins')).toBe(view.describe('plugin'))
  expect(view.atPoint('plugin.skins')).toBe(view.describe('skin'))
  expect(view.lookup('plugin')?.layout?.namespace).toBe('plugins')
  expect(view.lookup('skin')?.layout?.namespace).toBe('skins')
  await fiber.dispose()
  expect(view.list()).toEqual([])
  expect(view.atPoint('plugin.plugins')).toBeUndefined()
  expect(view.atPoint('plugin.skins')).toBeUndefined()
})

it('tells of its own only when given the ports: what the tenant holds is asked through them', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  const bare = root.plugin(pluginCategory())
  await bare.await()
  expect(root.assetCategories.view.effectOf('plugin')).toBeUndefined()
  await bare.dispose()
  const asked: string[] = []
  await root
    .plugin(
      pluginCategory(() => ({
        listed: async tenant => (asked.push(tenant), { kind: 'unavailable' }),
        serverPoints: () => [],
        clients: () => [],
        server: () => null,
      })),
    )
    .await()
  const made = capabilityId('plugin', 'tidy')
  if (!made.ok) throw new Error('capability')
  const effect = root.assetCategories.view.effectOf('plugin')
  expect(await effect?.placement.of({ tenant: 'alice', capability: made.id })).toEqual({
    kind: 'unavailable',
    reason: 'what the tenant holds cannot be read now',
  })
  expect(asked).toEqual(['alice'])
})

it('asks the categories as they stand when a package is judged, not as they stood when it registered', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  await root.plugin(pluginCategory()).await()
  const text = JSON.stringify({
    schema: 1,
    name: 'late',
    summary: 'A member of a category that came later.',
    server: { members: [{ point: 'note.notes', key: 'n', data: {} }] },
  })
  const bytes = new TextEncoder().encode(text)
  const pkg = {
    manifest: async () =>
      ({
        ok: { entries: [{ path: 'plugin.json', bytes: bytes.length, digest: 'sha256:x' }] },
      }) as const,
    open: async () => ({ ok: bytes }) as const,
  }
  const inspect = root.assetCategories.view.lookup('plugin')!.layout!.inspect
  expect('ok' in (await inspect(pkg))).toBe(true)
  root.assetCategories.contribute(
    {
      display: { title: 'Note', summary: 'A note.' },
      contract: {
        category: 'note',
        schema: { kind: 'null' },
        judge: () => ({ ok: false, rejected: 'too-short' }),
        deriveDeclarations: () => ({ entries: [] }),
        references: () => [],
      },
    },
    {
      ...(await import('@omne-harness/assets')).heldPoint({
        name: 'note.notes',
        key: 'k',
        summary: 's',
      }),
    },
  )
  expect(await inspect(pkg)).toEqual({
    failure: {
      kind: 'invalid-package',
      reason: 'server.members[0] (note.notes, n): the category note says too-short',
    },
  })
})
