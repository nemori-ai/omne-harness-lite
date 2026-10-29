import { expectTypeOf, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolShape } from '@omne-harness/tool-contract/provider'
import type {
  ToolResidencyReader,
  ToolResidencyReference,
} from '@omne-harness/tool-cordis-contract/cordis'
it('has a read-only system-scoped paginated reference port', () => {
  expectTypeOf<keyof ToolResidencyReader>().toEqualTypeOf<'referencing'>()
  expectTypeOf<ToolResidencyReference>().toEqualTypeOf<
    Readonly<{ holder: string; tenant: TenantId; shape: ToolShape }>
  >()
  expectTypeOf<
    Parameters<ToolResidencyReader['referencing']>[0]['scope']
  >().toEqualTypeOf<'system'>()
})
