import { expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ count: 0 }))

vi.mock('@omne-harness/schema-provider', async () => {
  const actual = await vi.importActual<typeof import('@omne-harness/schema-provider')>(
    '@omne-harness/schema-provider',
  )
  return {
    ...actual,
    createSchemaProvider(budget: Parameters<typeof actual.createSchemaProvider>[0]) {
      created.count += 1
      return actual.createSchemaProvider(budget)
    },
  }
})

it('does not create a schema cache when the public entry is imported', async () => {
  await import('@omne-harness/agent')
  expect(created.count).toBe(0)
})
