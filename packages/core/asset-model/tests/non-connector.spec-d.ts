import { expectTypeOf } from 'vitest'
import {
  attributeDeclarationsOf,
  BodyProviderUnavailableError,
  createAssetModelJudge,
  parseWorkspaceManifestText,
  referencesOf,
  type BodyContracts,
  type BodyContractSupply,
  type DeclarationResult,
  type NonConnectorBodyContracts,
} from '../src/index.ts'

declare const full: BodyContracts
declare const five: NonConnectorBodyContracts
const supplied: BodyContractSupply = five
createAssetModelJudge(full)
createAssetModelJudge(five)
createAssetModelJudge(supplied)
parseWorkspaceManifestText('{}', five)
referencesOf({ category: 'plugin', members: [] }, five)
const result = attributeDeclarationsOf({ category: 'mcp', body: {} }, five)
expectTypeOf(result).toEqualTypeOf<DeclarationResult<'mcp'>>()
expectTypeOf(new BodyProviderUnavailableError().category).toEqualTypeOf<'connector'>()
// @ts-expect-error the five-provider type does not satisfy the full-six obligation
const fabricatedFull: BodyContracts = five
// @ts-expect-error the partial type forbids an own Connector value
const forbiddenConnector: NonConnectorBodyContracts = full
// @ts-expect-error exactOptionalPropertyTypes also forbids own undefined
const forbiddenUndefined: NonConnectorBodyContracts = { ...five, connector: undefined }
// @ts-expect-error neither union branch accepts an own undefined Connector
createAssetModelJudge({ ...five, connector: undefined })
// @ts-expect-error a non-Connector port cannot be dropped
createAssetModelJudge({
  tool: five.tool,
  skill: five.skill,
  mcp: five.mcp,
  slash_command: five.slash_command,
})
// @ts-expect-error literal category discrimination remains strict for partial supplies
createAssetModelJudge({ ...five, skill: five.tool })
// @ts-expect-error the full protocol cannot put a tool in its Connector slot
createAssetModelJudge({ ...full, connector: full.tool })
void [fabricatedFull, forbiddenConnector, forbiddenUndefined]
