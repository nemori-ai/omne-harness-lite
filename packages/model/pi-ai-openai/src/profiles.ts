import type { ModelProfileDefinition, ReasoningEffortMapping } from '@omne-harness/model-contract'
import {
  officialProfilesOf,
  type OfficialProfilesInput,
} from '@omne-harness/pi-ai-transport/family-kit'
import { OPENAI_OWNER } from './owner.ts'
import type { OpenAiRecord } from './record.ts'
import { OPENAI_RECORDS } from './records.ts'

export function effortMapping(record: OpenAiRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'openai/gpt-6.2-astra':
    case 'openai/gpt-6.2-sol':
    case 'openai/gpt-6.1-sol':
    case 'openai/gpt-6.1-terra':
    case 'openai/gpt-6-astra':
    case 'openai/gpt-6-sol':
    case 'openai/gpt-6-luna':
    case 'openai/gpt-5.6-terra':
    case 'openai/gpt-5.6-luna':
      return { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
    case 'openai/gpt-6-astra-pro':
    case 'openai/gpt-6-sol-pro':
    case 'openai/gpt-6-luna-pro':
    case 'openai/gpt-5.6-sol':
    case 'openai/gpt-5.6-sol-pro':
    case 'openai/gpt-5.6-terra-pro':
    case 'openai/gpt-5.6-luna-pro':
      return { low: 'low', medium: 'medium', high: 'high' }
    default:
      return {}
  }
}

export function officialOpenAiProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition<'llm'>[] {
  return officialProfilesOf(OPENAI_OWNER, OPENAI_RECORDS, input, effortMapping)
}
