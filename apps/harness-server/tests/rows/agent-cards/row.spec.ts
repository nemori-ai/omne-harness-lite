import { expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { agentCardsRow } from '../../../src/rows/agent-cards/index.ts'

it('declares the agent-cards row: real, no shutdown phase, the card port over the session read', () => {
  expect(rowDeclarationOf(agentCardsRow)).toEqual({
    row: 'agent-cards',
    implementation: 'real',
    manifest: {
      provides: ['agentDecisionCards'],
      injects: ['session'],
      phase: null,
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'none' },
  })
})
