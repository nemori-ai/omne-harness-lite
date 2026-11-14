import { expect, it } from 'vitest'
import { obligationCategoryOf } from '@omne-harness/agent-contract'
import type { FinishObligation, ObligationCategory } from '@omne-harness/agent-contract'

const CATEGORY_OF: Record<FinishObligation['kind'], ObligationCategory> = {
  'accepted-input': 'inputs',
  control: 'controls',
  operation: 'operations',
  handoff: 'operations',
  call: 'operations',
  passage: 'passages',
  'card-round': 'passages',
  result: 'custody',
  material: 'custody',
  output: 'custody',
  'terminal-observation': 'custody',
}

it.each(Object.entries(CATEGORY_OF) as [FinishObligation['kind'], ObligationCategory][])(
  'puts a %s obligation in the %s category',
  (kind, category) => {
    expect(obligationCategoryOf(kind)).toBe(category)
  },
)
