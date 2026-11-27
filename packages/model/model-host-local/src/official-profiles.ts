import type { ModelProfileDefinition } from '@omne-harness/model-contract'
import { officialAnthropicProfiles } from '@omne-harness/pi-ai-anthropic'
import { NO_RESEND_RETRY_POLICY } from '@omne-harness/model'
import {
  officialOpenAiDecisionsProfiles,
  officialOpenAiProfiles,
  type OfficialProfilesInput,
} from '@omne-harness/pi-ai-openai'
import { officialDeepSeekProfiles } from '@omne-harness/pi-ai-deepseek'
import { officialGlmProfiles } from '@omne-harness/pi-ai-glm'
import { officialJevProfiles } from '@omne-harness/pi-ai-jev'
import { officialKimiProfiles } from '@omne-harness/pi-ai-kimi'
import { officialQwenProfiles } from '@omne-harness/pi-ai-qwen'

/** The profiles of every family this host installs: in release order, a decision asked once. */
export function officialProfiles(input: OfficialProfilesInput): readonly ModelProfileDefinition[] {
  const once = { retryPolicy: NO_RESEND_RETRY_POLICY }
  return [
    ...officialOpenAiProfiles(input),
    ...officialAnthropicProfiles(input),
    ...officialQwenProfiles(input),
    ...officialKimiProfiles(input),
    ...officialDeepSeekProfiles(input),
    ...officialGlmProfiles(input),
    ...officialOpenAiDecisionsProfiles(once),
    ...officialJevProfiles(once),
  ]
}
