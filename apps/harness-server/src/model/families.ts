import { anthropicTokenizerResources, createAnthropicFamily } from '@omne-harness/pi-ai-anthropic'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { createQwenFamily } from '@omne-harness/pi-ai-qwen'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import type { TiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'
import type { ModelRequestPreparationConfig } from '../rows/model-request-preparation/config.ts'

/** The official families of the release, each with its own operator limits and margin. Qwen
 * estimates with the o200k proxy of the OpenAI family, so both take the same resources. */
export function releaseFamilies(
  config: Pick<ModelRequestPreparationConfig, 'openai' | 'anthropic' | 'qwen'>,
  executor: Pick<TiktokenExecutor, 'acquire'>,
): ReturnType<typeof composeFamilies> {
  return composeFamilies([
    createOpenAiFamily({ tokenizer: openAiTokenizerResources(), executor, ...config.openai }),
    createAnthropicFamily({
      tokenizer: anthropicTokenizerResources(),
      executor,
      ...config.anthropic,
    }),
    createQwenFamily({ tokenizer: openAiTokenizerResources(), executor, ...config.qwen }),
  ])
}
