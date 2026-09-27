import { expectTypeOf } from 'vitest'
import {
  attributeDeclarationsOf,
  type BodyContract,
  type BodyContracts,
  type DeclarationResult,
} from '../src/index.ts'

const missing: { readonly declarations: readonly [] } = { declarations: [] }
// @ts-expect-error MCP result must include its own knowledge field in the declarations branch
const missingMarker: DeclarationResult<'mcp'> = missing
const validMcp: DeclarationResult<'mcp'> = { declarations: [], actionSnapshotKind: undefined }
const explicitNotFetched: DeclarationResult<'mcp'> = {
  declarations: [],
  actionSnapshotKind: 'not_fetched',
}
const nonMcpWithUndefined = { declarations: [], actionSnapshotKind: undefined }
// @ts-expect-error optional-never must also prohibit a field whose value is undefined
const forbiddenUndefined: DeclarationResult<'tool'> = nonMcpWithUndefined
const nonMcpWithFetched = { declarations: [], actionSnapshotKind: 'fetched' as const }
// @ts-expect-error non-MCP results cannot carry fetched knowledge either
const forbiddenFetched: DeclarationResult<'skill'> = nonMcpWithFetched
// @ts-expect-error an invalid marker cannot pass the MCP port type
const invalidMarker: DeclarationResult<'mcp'> = { declarations: [], actionSnapshotKind: 'other' }
// @ts-expect-error fixed MCP declarations cannot be replaced with whole underivable
const discardedFixed: DeclarationResult<'mcp'> = { underivable: 'mcp' }
const hiddenUndefined = { underivable: 'connector' as const, actionSnapshotKind: undefined }
// @ts-expect-error non-MCP underivable results also forbid the extra field
const forbiddenUnderivableField: DeclarationResult<'connector'> = hiddenUndefined

declare const ports: BodyContracts
const mcp = attributeDeclarationsOf({ category: 'mcp', body: {} }, ports)
expectTypeOf(mcp).toEqualTypeOf<DeclarationResult<'mcp'>>()
expectTypeOf(mcp.actionSnapshotKind).toEqualTypeOf<'fetched' | 'not_fetched' | undefined>()
// @ts-expect-error this overload preserves MCP's fixed known result
mcp.underivable
const tool = attributeDeclarationsOf({ category: 'tool', definition: {} }, ports)
expectTypeOf(tool).toEqualTypeOf<DeclarationResult<'tool'>>()
expectTypeOf<ReturnType<BodyContract<'mcp'>['deriveDeclarations']>>().toEqualTypeOf<
  DeclarationResult<'mcp'>
>()
expectTypeOf(validMcp).toEqualTypeOf<DeclarationResult<'mcp'>>()
expectTypeOf(explicitNotFetched).toEqualTypeOf<DeclarationResult<'mcp'>>()
void [
  missingMarker,
  forbiddenUndefined,
  forbiddenFetched,
  invalidMarker,
  discardedFixed,
  forbiddenUnderivableField,
]
