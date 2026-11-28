import type { DecisionsRecord } from '@omne-harness/pi-ai-transport/family-kit'

export const JEV_OWNER = '@omne-harness/pi-ai-jev'

const EVIDENCE =
  'OpenRouter decisions interface (alpha), text or JSON material and named questions; no question limit is stated for Jev. Carried over from the transport list of decision models on 2026-11-26, not measured again.'

function jev(model: string): DecisionsRecord {
  return {
    name: model,
    revision: '1',
    route: { provider: 'openrouter', model },
    status: 'current',
    decisions: { maxQuestions: null },
    profile: { input: ['text'], output: ['text'], evidence: EVIDENCE },
  }
}

export const JEV_RECORDS: readonly DecisionsRecord[] = [
  jev('typesafe/jev-1.13'),
  jev('typesafe/jev-1.14'),
]
