import { expectTypeOf, it } from 'vitest'
import type {
  ToolAvailability,
  ToolCatalog,
  ToolCatalogSearchEntry,
} from '@omne-harness/tool-contract'

it('search entries carry residency without changing inspect availability', () => {
  expectTypeOf<ToolCatalogSearchEntry>().toEqualTypeOf<
    ToolAvailability & Readonly<{ resident: boolean }>
  >()
  type Search = Extract<
    Awaited<ReturnType<ToolCatalog<string>['search']>>,
    { ok: unknown }
  >['ok']['entries'][number]
  expectTypeOf<Search>().toEqualTypeOf<ToolCatalogSearchEntry>()
  type Inspect = Extract<Awaited<ReturnType<ToolCatalog<string>['inspect']>>, { ok: unknown }>['ok']
  expectTypeOf<Inspect>().toEqualTypeOf<ToolAvailability>()
})
