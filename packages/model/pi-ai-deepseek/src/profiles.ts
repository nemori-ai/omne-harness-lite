import type { ModelProfileDefinition, ReasoningEffortMapping } from '@omne-harness/model-contract'
import {
  officialProfilesOf,
  type OfficialProfilesInput,
} from '@omne-harness/pi-ai-transport/family-kit'
import { DEEPSEEK_OWNER } from './owner.ts'
import type { DeepSeekRecord } from './record.ts'
import { DEEPSEEK_RECORDS } from './records.ts'

export function effortMapping(record: DeepSeekRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'deepseek/deepseek-v4.1-flash':
    case 'deepseek/deepseek-v4.1-flash-1017':
    case 'deepseek/deepseek-v4-pro-0813':
    case 'deepseek/deepseek-v4-flash-0731':
    case 'deepseek/deepseek-v4-flash-vision-exp':
      return { low: 'low', medium: 'high', high: 'max' }
    case 'deepseek/deepseek-v4-pro':
    case 'deepseek/deepseek-v4-flash':
      return { medium: 'high', high: 'max' }
    default:
      return {}
  }
}

export function officialDeepSeekProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  return officialProfilesOf(DEEPSEEK_OWNER, DEEPSEEK_RECORDS, input, effortMapping)
}
