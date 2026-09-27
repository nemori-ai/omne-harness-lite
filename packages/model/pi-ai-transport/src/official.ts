import { ownDefinitions, type ModelDefinition } from './definitions.ts'

function familyDefinitions(
  family: string,
  reminderRole: ModelDefinition['reminderRole'],
  route: string,
  cacheMode: 'automatic' | 'explicit',
  modelIds: readonly string[],
): ModelDefinition[] {
  return modelIds.map(modelId => ({
    modelId,
    revision: '1',
    implementation: { name: `omne-official:openrouter-${family}`, revision: '6' },
    reminderRole,
    routes: { [route]: cacheMode },
  }))
}

/**
 * The confirmed 37-model contribution set. These definitions require explicit
 * admission and configuration; their presence is not production certification.
 */
export const officialDefinitions: readonly ModelDefinition[] = ownDefinitions([
  ...familyDefinitions('openai', 'developer', 'openai', 'automatic', [
    'openai/gpt-6-astra',
    'openai/gpt-6-astra-pro',
    'openai/gpt-6-sol',
    'openai/gpt-6-sol-pro',
    'openai/gpt-6-luna',
    'openai/gpt-6-luna-pro',
    'openai/gpt-5.6-sol',
    'openai/gpt-5.6-sol-pro',
    'openai/gpt-5.6-terra',
    'openai/gpt-5.6-terra-pro',
    'openai/gpt-5.6-luna',
    'openai/gpt-5.6-luna-pro',
  ]),
  ...familyDefinitions('anthropic', 'user', 'anthropic', 'explicit', [
    'anthropic/claude-opus-5.5',
    'anthropic/claude-opus-5',
    'anthropic/claude-sonnet-5',
    'anthropic/claude-fable-5.1',
  ]),
  ...familyDefinitions('deepseek', 'user', 'deepinfra/fp8', 'automatic', [
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-pro-0813',
  ]),
  ...familyDefinitions('google', 'user', 'google-ai-studio', 'automatic', [
    'google/gemini-3.8-flash',
    'google/gemini-3.7-flash',
  ]),
  ...familyDefinitions('xai', 'user', 'xai', 'automatic', ['x-ai/grok-4.7', 'x-ai/grok-4.6']),
  ...familyDefinitions('qwen', 'user', 'alibaba', 'explicit', [
    'qwen/qwen3.8-max-0902',
    'qwen/qwen3.8-max-prime',
    'qwen/qwen3.8-2.4t-a95b',
    'qwen/qwen3.8-27b',
    'qwen/qwen3.7-max',
    'qwen/qwen3.7-plus',
  ]),
  ...familyDefinitions('qwen', 'user', 'alibaba', 'automatic', [
    'qwen/qwen3.8-flash',
    'qwen/qwen3.7-flash',
  ]),
  ...familyDefinitions('moonshot', 'user', 'moonshotai/mxfp4', 'automatic', ['moonshotai/kimi-k3']),
  ...familyDefinitions('moonshot', 'user', 'moonshotai/int4', 'automatic', [
    'moonshotai/kimi-k2.7-code',
  ]),
  ...familyDefinitions('zai', 'user', 'z-ai/fp8', 'automatic', [
    'z-ai/glm-5.3',
    'z-ai/glm-5.3-flash',
    'z-ai/glm-5.3-flashx',
    'z-ai/glm-5.2',
  ]),
  ...familyDefinitions('zai', 'user', 'alibaba', 'explicit', ['z-ai/glm-5.3-prime']),
])
