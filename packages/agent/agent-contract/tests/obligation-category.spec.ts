import { expect, it } from 'vitest'
import { obligationCategoryOf } from '@omne-harness/agent-contract'
import type { FinishObligation, ObligationCategory } from '@omne-harness/agent-contract'

// The "类别" column of the SPEC "终结责任清单" table. The `Record` type makes a missing or an extra
// kind a type error, so the table cannot drift from the `FinishObligation` union unnoticed.
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

// Goes red when one kind moves to another category: the cancellation order and the blocked
// category a Journal reports both derive from this mapping.
it.each(Object.entries(CATEGORY_OF) as [FinishObligation['kind'], ObligationCategory][])(
  'puts a %s obligation in the %s category',
  (kind, category) => {
    expect(obligationCategoryOf(kind)).toBe(category)
  },
)
