import type { Adoption, ModelProfileDefinition } from '@omne-harness/model-contract'
import type { PiDecisionsBinding, PiFamily } from '@omne-harness/pi-ai-transport'
import {
  defineDecisionsFamily,
  officialDecisionsProfilesOf,
  type DecisionsRecord,
} from '@omne-harness/pi-ai-transport/family-kit'

export const OPENAI_DECISIONS_OWNER = '@omne-harness/pi-ai-openai/decisions'

export const OPENAI_DECISIONS_RECORDS: readonly DecisionsRecord[] = [
  {
    name: 'openai/gpt-6-luna-decisions',
    revision: '1',
    route: { provider: 'openrouter', model: 'openai/gpt-6-luna-decisions' },
    status: 'current',
    decisions: { maxQuestions: '200' },
    profile: {
      input: ['text'],
      output: ['text'],
      evidence:
        'OpenRouter decisions interface (alpha), text or JSON material and named questions; one request takes at most 200 questions. Carried over from the transport list of decision models on 2026-11-26, not measured again.',
    },
  },
]

export function createOpenAiDecisionsFamily(): PiFamily<PiDecisionsBinding> {
  return defineDecisionsFamily({
    owner: OPENAI_DECISIONS_OWNER,
    records: OPENAI_DECISIONS_RECORDS,
  })
}

export function officialOpenAiDecisionsProfiles(
  input: Readonly<{ retryPolicy: Adoption }>,
): readonly ModelProfileDefinition<'decisions'>[] {
  return officialDecisionsProfilesOf(OPENAI_DECISIONS_OWNER, OPENAI_DECISIONS_RECORDS, input)
}
