import { expectTypeOf, it } from 'vitest'
import type { PluginRow, PluginTreeHandle } from '../src/index.ts'
import type { AssemblyCloseReport } from '@omne-harness-lite/assembly-lifecycle'
it('keeps runtime handles outside JSON configuration', () => {
  const row: PluginRow = { id: 'a', plugin: { package: 'provider', export: 'Managed' }, config: {} }
  expectTypeOf(row.config).not.toBeAny()
  expectTypeOf<PluginTreeHandle['closed']>().toEqualTypeOf<Promise<AssemblyCloseReport>>()
  // @ts-expect-error JSON config cannot carry callbacks
  const invalid: PluginRow = { ...row, config: { close: () => {} } }
  void invalid
})
