import { anthropicTokenizerResources, createAnthropicFamily } from '@omne-harness/pi-ai-anthropic'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { createDeepSeekFamily } from '@omne-harness/pi-ai-deepseek'
import { createGlmFamily } from '@omne-harness/pi-ai-glm'
import { createKimiFamily } from '@omne-harness/pi-ai-kimi'
import { createQwenFamily } from '@omne-harness/pi-ai-qwen'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import type { TiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'
import type { ModelRequestPreparationConfig } from '../rows/model-request-preparation/config.ts'

/** The official families of the release, each with its own operator limits and margin.
 * The OpenAI family supplies the shared o200k vocabulary. */
export function releaseFamilies(
  config: Pick<
    ModelRequestPreparationConfig,
    'openai' | 'anthropic' | 'qwen' | 'kimi' | 'deepseek' | 'glm'
  >,
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
    createKimiFamily({ tokenizer: openAiTokenizerResources(), executor, ...config.kimi }),
    createDeepSeekFamily({ tokenizer: openAiTokenizerResources(), executor, ...config.deepseek }),
    createGlmFamily({ tokenizer: openAiTokenizerResources(), executor, ...config.glm }),
  ])
}
