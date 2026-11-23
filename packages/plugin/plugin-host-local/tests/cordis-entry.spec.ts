import { Context } from '@deepseek-ai/cordis'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { pluginCategoryDisplay } from '@omne-harness/plugin-host-local'
import { pluginCategoryPlugin } from '@omne-harness/plugin-host-local/cordis'
import { expect, it } from 'vitest'

it('the cordis entry exports the plugin that registers the category', async () => {
  const cordis = (await import('@omne-harness/plugin-host-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['pluginCategoryPlugin'])
})

it('contributes the category with its point, and withdraws both on unload', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  const fiber = root.plugin(pluginCategoryPlugin)
  await fiber.await()
  const { view } = root.assetCategories
  expect(view.list()).toEqual([
    {
      category: 'plugin',
      display: pluginCategoryDisplay,
      creation: 'directory',
      point: 'plugin.plugins',
    },
  ])
  expect(view.atPoint('plugin.plugins')).toBe(view.describe('plugin'))
  expect(view.lookup('plugin')?.layout?.namespace).toBe('plugins')
  await fiber.dispose()
  expect(view.list()).toEqual([])
  expect(view.atPoint('plugin.plugins')).toBeUndefined()
})

it('asks the categories as they stand when a package is judged, not as they stood when it registered', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  await root.plugin(pluginCategoryPlugin).await()
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
