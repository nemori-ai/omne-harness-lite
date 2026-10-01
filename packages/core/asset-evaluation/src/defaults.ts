import {
  createAssetModelJudge,
  type BodyJudgeContext,
  type NonConnectorBodyContracts,
} from '@omne-harness-lite/asset-model'
import { toolBodyContract } from '@omne-harness-lite/tool-definition'
import { loopExtensionBodyContract as currentLoopBodyContract } from '@omne-harness-lite/loop-extension'
import loopSchemaV3 from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import { skillBodyContract } from '@omne-harness-lite/skill-package/v2'
import { mcpBodyContract } from '@omne-harness-lite/mcp-endpoint'
import { slashCommandBodyContract } from '@omne-harness-lite/slash-command'

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
const loopExtensionBodyContract: typeof currentLoopBodyContract = Object.freeze({
  ...currentLoopBodyContract,
  schema: loopSchemaV3,
  judge(body: unknown, context?: BodyJudgeContext) {
    if (context?.definition !== undefined && !declarationDefinitions.has(context.definition))
      throw new TypeError('unknown asset-model loop declaration definition')
    return currentLoopBodyContract.judge(body, context)
  },
})

/** M51's single composition root; only the five actual available providers. */
export const defaultBodyContracts: NonConnectorBodyContracts = Object.freeze({
  tool: toolBodyContract,
  loop_extension: loopExtensionBodyContract,
  skill: skillBodyContract,
  mcp: mcpBodyContract,
  slash_command: slashCommandBodyContract,
})
export const assetJudge = createAssetModelJudge(defaultBodyContracts)
