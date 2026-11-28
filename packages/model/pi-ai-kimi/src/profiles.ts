import type { ModelProfileDefinition, ReasoningEffortMapping } from '@omne-harness/model-contract'
import {
  officialProfilesOf,
  type OfficialProfilesInput,
} from '@omne-harness/pi-ai-transport/family-kit'
import { KIMI_OWNER } from './owner.ts'
import type { KimiRecord } from './record.ts'
import { KIMI_RECORDS } from './records.ts'

export function effortMapping(record: KimiRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'moonshotai/kimi-k3.1-pro':
    case 'moonshotai/kimi-k3':
      return { low: 'low', medium: 'high', high: 'max' }
    default:
      return {}
  }
}

export function officialKimiProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition<'llm'>[] {
  return officialProfilesOf(KIMI_OWNER, KIMI_RECORDS, input, effortMapping)
}
