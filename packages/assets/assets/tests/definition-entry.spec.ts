import { expect, it } from 'vitest'
import { judgeAgentDefinition } from '@omne-harness/agent-contract'

it('assets reads a definition from the public entry and sees a refusal', async () => {
  const accepted = await judgeAgentDefinition({
    category: 'AgentDefinition',
    name: 'coding',
    references: [],
    attributes: [{ item: 'model' }],
  })
  const refused = await judgeAgentDefinition({
    category: 'AgentDefinition',
    name: 'coding',
    references: null,
    attributes: [],
  })
  expect(accepted).toMatchObject({
    kind: 'accepted',
    value: { attributes: [{ item: 'model' }], version: { kind: 'then-legal-winner' } },
  })
  expect(refused).toEqual({ kind: 'refused', reason: 'malformed' })
})
