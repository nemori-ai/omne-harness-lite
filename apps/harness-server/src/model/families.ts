import { anthropicTokenizerResources, createAnthropicFamily } from '@omne-harness/pi-ai-anthropic'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { createKimiFamily } from '@omne-harness/pi-ai-kimi'
import { createQwenFamily } from '@omne-harness/pi-ai-qwen'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import type { TiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'
import type { ModelRequestPreparationConfig } from '../rows/model-request-preparation/config.ts'

/** The official families of the release, each with its own operator limits and margin.
 * Kimi and Qwen estimate text with the o200k vocabulary supplied by the OpenAI family. */
export function releaseFamilies(
  config: Pick<ModelRequestPreparationConfig, 'openai' | 'anthropic' | 'qwen' | 'kimi'>,
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
  ])
}
