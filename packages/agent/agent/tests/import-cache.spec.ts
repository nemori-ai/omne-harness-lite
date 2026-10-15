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
  await import('@omne-harness/agent')
  expect(counts.created).toBe(0)
  expect(counts.closed).toBe(0)
})

it('uses one schema domain for a two-item extension batch', async () => {
  const { judgeLoopExtensions } = await import('@omne-harness/agent')
  const result = await judgeLoopExtensions([
    { name: 'a', position: 'before_model_call', power: 'observe' },
    { name: 'b', position: 'before_model_call', power: 'observe' },
  ])
  expect(result).toMatchObject({ kind: 'accepted' })
  expect(counts.created).toBe(1)
  expect(counts.closed).toBe(1)
})
