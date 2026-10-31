import { expect, it } from 'vitest'

it('the root entry exports exactly the two factories', async () => {
  const root = (await import('@omne-harness/request-context')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createContextAccounting',
    'createContextSourceRegistry',
  ])
  for (const value of Object.values(root)) expect(typeof value).toBe('function')
})
