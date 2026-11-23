import type { ModelProfileDefinition } from '@omne-harness/model-contract'
import { officialAnthropicProfiles } from '@omne-harness/pi-ai-anthropic'
import { officialOpenAiProfiles, type OfficialProfilesInput } from '@omne-harness/pi-ai-openai'
import { officialDeepSeekProfiles } from '@omne-harness/pi-ai-deepseek'
import { officialKimiProfiles } from '@omne-harness/pi-ai-kimi'
import { officialQwenProfiles } from '@omne-harness/pi-ai-qwen'

/** The profiles of every family this host installs: in release order. */
export function officialProfiles(input: OfficialProfilesInput): readonly ModelProfileDefinition[] {
  return [
    ...officialOpenAiProfiles(input),
    ...officialAnthropicProfiles(input),
    ...officialQwenProfiles(input),
    ...officialKimiProfiles(input),
    ...officialDeepSeekProfiles(input),
  ]
}
