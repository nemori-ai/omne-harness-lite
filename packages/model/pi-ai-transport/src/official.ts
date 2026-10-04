import { anthropicDefinitions } from './official-models/anthropic.ts'
import { deepseekDefinitions } from './official-models/deepseek.ts'
import { googleDefinitions } from './official-models/google.ts'
import { moonshotDefinitions } from './official-models/moonshot.ts'
import { openaiDefinitions } from './official-models/openai.ts'
import { qwenDefinitions } from './official-models/qwen.ts'
import { xaiDefinitions } from './official-models/xai.ts'
import { zaiDefinitions } from './official-models/zai.ts'

/** Identities come from the same complete, validated declarations exposed publicly. */
export const officialModelIds: readonly string[] = Object.freeze(
  [
    openaiDefinitions,
    anthropicDefinitions,
    deepseekDefinitions,
    googleDefinitions,
    xaiDefinitions,
    qwenDefinitions,
    moonshotDefinitions,
    zaiDefinitions,
  ].flatMap(definitions => definitions.map(definition => definition.modelId)),
)
