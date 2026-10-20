import { expect, it, vi } from 'vitest'

const counts = vi.hoisted(() => ({ created: 0, closed: 0 }))

vi.mock('@omne-harness/schema-provider', async () => {
  const actual = await vi.importActual<typeof import('@omne-harness/schema-provider')>(
    '@omne-harness/schema-provider',
  )
  return {
    ...actual,
    createSchemaProvider(budget: Parameters<typeof actual.createSchemaProvider>[0]) {
      counts.created += 1
      return actual.createSchemaProvider(budget)
    },
    close(...args: Parameters<typeof actual.close>) {
      counts.closed += 1
      return actual.close(...args)
    },
  }
})

it('does not create a schema cache when the public entry is imported', async () => {
  const created = counts.created
  const closed = counts.closed
  await import('@omne-harness/agent-contract')
  expect(counts.created).toBe(created)
  expect(counts.closed).toBe(closed)
})

it('uses one schema domain for a two-item extension batch', async () => {
  const { judgeLoopExtensions } = await import('@omne-harness/agent-contract')
  const created = counts.created
  const closed = counts.closed
  const result = await judgeLoopExtensions([
    {
      name: 'a',
      position: 'before_model_call',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'format' },
    },
    {
      name: 'b',
      position: 'before_model_call',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'format' },
    },
  ])
  expect(result).toMatchObject({ kind: 'accepted' })
  expect(counts.created).toBe(created + 1)
  expect(counts.closed).toBe(closed + 1)
})

it('opens and closes one schema domain for one definition judgment', async () => {
  const { judgeAgentDefinition } = await import('@omne-harness/agent-contract')
  const created = counts.created
  const closed = counts.closed
  const result = await judgeAgentDefinition({
    category: 'AgentDefinition',
    name: 'coding',
    references: [],
    attributes: [],
  })
  expect(result).toMatchObject({ kind: 'accepted' })
  expect(counts.created).toBe(created + 1)
  expect(counts.closed).toBe(closed + 1)
})
