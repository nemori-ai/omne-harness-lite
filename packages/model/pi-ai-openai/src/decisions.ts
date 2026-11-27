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
    endpoint: 'decisions',
    records: OPENAI_DECISIONS_RECORDS,
  })
}

/** The decisions models OpenAI serves itself, on its own decisions interface. */
export const OPENAI_DIRECT_DECISIONS_OWNER = '@omne-harness/pi-ai-openai/direct-decisions'

export const OPENAI_DIRECT_DECISIONS_RECORDS: readonly DecisionsRecord[] = [
  {
    name: 'gpt-6-luna',
    revision: '1',
    route: { provider: 'openai', model: 'gpt-6-luna' },
    status: 'current',
    decisions: { maxQuestions: '400' },
    profile: {
      input: ['text'],
      output: ['text'],
      evidence:
        'OpenAI decisions interface, measured 2026-11-27: 400 yes-or-no questions on one text were all answered, 401 were refused with 400 "array too long ... maximum length 400". Measured 2026-11-26: a predicate, a choice and a score question on one text were each answered in its type; usage in input and output tokens, no cost.',
    },
  },
]

export function createOpenAiDirectDecisionsFamily(): PiFamily<PiDecisionsBinding> {
  return defineDecisionsFamily({
    owner: OPENAI_DIRECT_DECISIONS_OWNER,
    endpoint: 'decisions-v1',
    records: OPENAI_DIRECT_DECISIONS_RECORDS,
  })
}

/** The official decisions profiles of OpenAI's models: through OpenRouter, then at OpenAI itself. */
export function officialOpenAiDecisionsProfiles(
  input: Readonly<{ retryPolicy: Adoption }>,
): readonly ModelProfileDefinition<'decisions'>[] {
  return [
    ...officialDecisionsProfilesOf(OPENAI_DECISIONS_OWNER, OPENAI_DECISIONS_RECORDS, input),
    ...officialDecisionsProfilesOf(
      OPENAI_DIRECT_DECISIONS_OWNER,
      OPENAI_DIRECT_DECISIONS_RECORDS,
      input,
    ),
  ]
}
