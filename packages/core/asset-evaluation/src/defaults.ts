import {
  createAssetModelJudge,
  type NonConnectorBodyContracts,
} from '@omne-harness-lite/asset-model'
import { toolBodyContract } from '@omne-harness-lite/tool-definition'
import { loopExtensionBodyContract } from '@omne-harness-lite/loop-extension'
import { skillBodyContract } from '@omne-harness-lite/skill-package'
import { mcpBodyContract } from '@omne-harness-lite/mcp-endpoint'
import { slashCommandBodyContract } from '@omne-harness-lite/slash-command'

/** M51's single composition root; only the five actual available providers. */
export const defaultBodyContracts: NonConnectorBodyContracts = Object.freeze({
  tool: toolBodyContract,
  loop_extension: loopExtensionBodyContract,
  skill: skillBodyContract,
  mcp: mcpBodyContract,
  slash_command: slashCommandBodyContract,
})
export const assetJudge = createAssetModelJudge(defaultBodyContracts)
