import {
  createAssetModelJudge,
  type AssetModelJudge,
  type BodyCategory,
  type BodyContract,
  type BodyJudgeContext,
  type NonConnectorBodyContracts,
} from '@omne-harness-lite/asset-model'
import { toolBodyContract } from '@omne-harness-lite/tool-definition'
import { loopExtensionBodyContract as currentLoopBodyContract } from '@omne-harness-lite/loop-extension'
import loopSchemaV3 from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import { skillBodyContract } from '@omne-harness-lite/skill-package/v2'
import { mcpBodyContract } from '@omne-harness-lite/mcp-endpoint'
import { slashCommandBodyContract } from '@omne-harness-lite/slash-command'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { object } from './json.ts'

const declarationDefinitions = new Set([
  'LoopExtensionDefinition',
  'Power',
  'LoopPosition',
  'Dimension',
  'ExtensionImplementation',
  'ErrorPolicy',
  'UnavailabilityPolicy',
])

/** The asset-model v3 graph consumes the exact LC3 declaration resource. */
const judgeCurrentLoopBody = currentLoopBodyContract.judge
const loopExtensionBodyContract: typeof currentLoopBodyContract = Object.freeze({
  ...currentLoopBodyContract,
  schema: loopSchemaV3,
  judge(body: unknown, context?: BodyJudgeContext) {
    if (context?.definition !== undefined && !declarationDefinitions.has(context.definition))
      throw new TypeError('unknown asset-model loop declaration definition')
    return judgeCurrentLoopBody(body, context)
  },
})

/** Publish owned resources and responsibility closures before any default judge is needed. */
function snapshotBodyContract<C extends BodyCategory>(port: BodyContract<C>): BodyContract<C> {
  const copied = copyJsonValue(port.schema)
  if (!('ok' in copied) || !object(copied.ok) || typeof copied.ok.$id !== 'string')
    throw new TypeError(`body Schema needs an id: ${port.category}`)
  return Object.freeze({
    category: port.category,
    schema: copied.ok,
    judge: port.judge,
    deriveDeclarations: port.deriveDeclarations,
    references: port.references,
  })
}

/** M51's single composition root; only the five actual available providers. */
export const defaultBodyContracts: NonConnectorBodyContracts = Object.freeze({
  tool: snapshotBodyContract(toolBodyContract),
  loop_extension: snapshotBodyContract(loopExtensionBodyContract),
  skill: snapshotBodyContract(skillBodyContract),
  mcp: snapshotBodyContract(mcpBodyContract),
  slash_command: snapshotBodyContract(slashCommandBodyContract),
})

export function captureBodyContracts(tool: BodyContract<'tool'>): NonConnectorBodyContracts {
  return Object.freeze({
    ...defaultBodyContracts,
    tool: snapshotBodyContract(tool),
  })
}
let assetJudge: AssetModelJudge | undefined
export function getAssetJudge(): AssetModelJudge {
  return (assetJudge ??= createAssetModelJudge(defaultBodyContracts))
}
