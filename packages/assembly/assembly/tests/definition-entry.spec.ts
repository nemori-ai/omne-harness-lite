import { expect, it } from 'vitest'
import { judgeAgentDefinition, judgeLoopExtensions } from '@omne-harness/agent-contract'

const definitionInput = {
  category: 'AgentDefinition',
  name: 'coding',
  references: [{ capability: { category: 'Tool', name: 'read_file' } }],
  attributes: [],
}

it('assembly reads a definition and an extension list from the public entry', async () => {
  const definition = await judgeAgentDefinition(definitionInput)
  const extensions = await judgeLoopExtensions([
    {
      name: 'format',
      position: 'before_model_call',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'format' },
    },
  ])
  expect(definition).toEqual({
    kind: 'accepted',
    value: {
      category: 'AgentDefinition',
      name: 'coding',
      references: [{ capability: { category: 'Tool', name: 'read_file' } }],
      attributes: [],
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

it('refuses a definition that states a version as malformed', async () => {
  expect(await judgeAgentDefinition({ ...definitionInput, version: 'v2' })).toEqual({
    kind: 'refused',
    reason: 'malformed',
  })
})
