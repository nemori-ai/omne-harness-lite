import { expectTypeOf } from 'vitest'
import {
  attributeDeclarationsOf,
  parseWorkspaceManifestText,
  type AssetModelJudge,
  type BodyContractSupply,
  type DeclarationResult,
} from '../src/index.ts'

declare const owner: AssetModelJudge
declare const supply: BodyContractSupply
const mcp = owner.attributeDeclarationsOf({ category: 'mcp', body: {} })
expectTypeOf(mcp).toEqualTypeOf<DeclarationResult<'mcp'>>()
const tool = attributeDeclarationsOf({ category: 'tool', definition: {} }, owner)
expectTypeOf(tool).toEqualTypeOf<DeclarationResult<'tool'>>()
parseWorkspaceManifestText('{}', owner)
// @ts-expect-error declarations must reuse an owner; the former supply argument is removed
attributeDeclarationsOf({ category: 'tool', definition: {} }, supply)
// @ts-expect-error manifest parsing must reuse an owner; the former supply argument is removed
parseWorkspaceManifestText('{}', supply)
// @ts-expect-error the owner method has no independently paired supply argument
owner.attributeDeclarationsOf({ category: 'tool', definition: {} }, supply)
