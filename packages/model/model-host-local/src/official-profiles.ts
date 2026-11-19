import type { ModelProfileDefinition } from '@omne-harness/model-contract'
import { officialAnthropicProfiles } from '@omne-harness/pi-ai-anthropic'
import { officialOpenAiProfiles, type OfficialProfilesInput } from '@omne-harness/pi-ai-openai'

/** The profiles of every family this host installs: OpenAI's, then Anthropic's. */
export function officialProfiles(input: OfficialProfilesInput): readonly ModelProfileDefinition[] {
  return [...officialOpenAiProfiles(input), ...officialAnthropicProfiles(input)]
}
