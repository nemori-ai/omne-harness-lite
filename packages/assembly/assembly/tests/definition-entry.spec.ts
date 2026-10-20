import { expect, it } from 'vitest'
import { judgeAgentDefinition, judgeLoopExtensions } from '@omne-harness/agent-contract'

it('assembly reads a definition and an extension list from the public entry', async () => {
  const definition = await judgeAgentDefinition({
    category: 'AgentDefinition',
    name: 'coding',
    version: 'v2',
    references: [{ capability: { category: 'Tool', name: 'read_file' } }],
    attributes: [],
  })
  const extensions = await judgeLoopExtensions([
    {
      name: 'format',
      position: 'before_model_call',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'format' },
    },
  ])
  expect(definition).toMatchObject({
    kind: 'accepted',
    value: {
      category: 'AgentDefinition',
      name: 'coding',
      version: { kind: 'pinned', version: 'v2' },
    },
  })
  expect(extensions).toEqual({
    kind: 'accepted',
    value: [
      {
        name: 'format',
        position: 'before_model_call',
        power: 'observe',
        implementation: { kind: 'builtin', builtinName: 'format' },
      },
    ],
  })
})
