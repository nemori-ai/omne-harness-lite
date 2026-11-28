import type { ModelProfileDefinition, ReasoningEffortMapping } from '@omne-harness/model-contract'
import {
  officialProfilesOf,
  type OfficialProfilesInput,
} from '@omne-harness/pi-ai-transport/family-kit'
import { QWEN_OWNER } from './owner.ts'
import type { QwenRecord } from './record.ts'
import { QWEN_RECORDS } from './records.ts'

export function effortMapping(record: QwenRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'qwen/qwen3.8-omni-flash':
      return { low: 'low', medium: 'medium', xhigh: 'xhigh' }
    default:
      return {}
  }
}

export function officialQwenProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition<'llm'>[] {
  return officialProfilesOf(QWEN_OWNER, QWEN_RECORDS, input, effortMapping)
}
