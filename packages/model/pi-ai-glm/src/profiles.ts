import type { ModelProfileDefinition, ReasoningEffortMapping } from '@omne-harness/model-contract'
import {
  officialProfilesOf,
  type OfficialProfilesInput,
} from '@omne-harness/pi-ai-transport/family-kit'
import { GLM_OWNER } from './owner.ts'
import type { GlmRecord } from './record.ts'
import { GLM_RECORDS } from './records.ts'

export function effortMapping(record: GlmRecord): ReasoningEffortMapping {
  switch (record.name) {
    case 'z-ai/glm-5.3':
    case 'z-ai/glm-5.3-prime':
    case 'z-ai/glm-5.3-flash':
    case 'z-ai/glm-5.3-flashx':
      return { low: 'low', medium: 'high', high: 'max' }
    case 'z-ai/glm-5.2':
      return { high: 'high', xhigh: 'xhigh' }
    default:
      return {}
  }
}

export function officialGlmProfiles(
  input: OfficialProfilesInput,
): readonly ModelProfileDefinition[] {
  return officialProfilesOf(GLM_OWNER, GLM_RECORDS, input, effortMapping)
}
