import { expect, it } from 'vitest'

it('the public entry exports exactly the accepted runtime names', async () => {
  const root = (await import('@omne-harness/utc-instant')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['compareInstants', 'encodeInstant', 'parseInstant'])
})
