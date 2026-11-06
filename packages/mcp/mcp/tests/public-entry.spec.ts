// The public root of the built package: the two factories, and nothing internal.
import { expect, it } from 'vitest'

it('exports the two factories from the public root', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/mcp')
  expect(Object.keys(root).sort()).toEqual(['createInMemoryCatalogStore', 'createMcp'])
  expect(typeof root['createMcp']).toBe('function')
  expect(typeof root['createInMemoryCatalogStore']).toBe('function')
})

it('does not export the aggregates, the gate or the connection table', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/mcp')
  for (const internal of [
    'Connection',
    'InFlightCalls',
    'admit',
    'assemble',
    'createConnectionTable',
  ])
    expect(root[internal]).toBeUndefined()
})
