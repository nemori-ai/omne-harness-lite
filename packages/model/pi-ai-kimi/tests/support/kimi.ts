import { createKimiFamily, type KimiFamilyConfig } from '@omne-harness/pi-ai-kimi'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { testExecutor } from './executor.ts'

const executor = await testExecutor([openAiTokenizerResources()])
const config: KimiFamilyConfig = {
  tokenizer: openAiTokenizerResources(),
  executor,
  limits: {
    toolArguments: {
      maxBytes: 65_536,
      maxDepth: 32,
      maxItems: 1_024,
      maxMembers: 256,
      maxStringLength: 65_536,
      maxNumberLength: 64,
    },
    maxReasoningText: 65_536,
  },
  margin: {
    percent: '10',
    source: { owner: 'pi-ai-kimi-tests', name: 'margin', revision: '1', digest: 'a'.repeat(64) },
  },
}

export const FAMILY = createKimiFamily(config)
