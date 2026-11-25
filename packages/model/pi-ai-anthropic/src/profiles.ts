import type { ModelProfileDefinition, ReasoningEffortMapping } from '@omne-harness/model-contract'
import {
  officialProfilesOf,
  type OfficialProfilesInput,
} from '@omne-harness/pi-ai-transport/family-kit'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord } from './record.ts'
import { ANTHROPIC_RECORDS } from './records.ts'

export function effortMapping(record: AnthropicRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'anthropic/claude-fable-5.2':
    case 'anthropic/claude-fable-5.1':
    case 'anthropic/claude-opus-5.5':
    case 'anthropic/claude-opus-5':
    case 'anthropic/claude-sonnet-5.5':
    case 'anthropic/claude-sonnet-5':
    case 'anthropic/claude-haiku-5.5':
      return { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
    default:
      return {}
  }
}

export function officialAnthropicProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  return officialProfilesOf(ANTHROPIC_OWNER, ANTHROPIC_RECORDS, input, effortMapping)
}
