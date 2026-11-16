import { expect, it } from 'vitest'

it('exports the availability step, the default backoff and the key text', async () => {
  const root = (await import('@omne-harness/client-assembly')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['applyFrame', 'defaultBackoff', 'keyText'])
})
