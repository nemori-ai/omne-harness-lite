import { expect, it } from 'vitest'

it('keeps the root entry free of runtime values', async () => {
  const root: Record<string, unknown> =
    await import('@omne-harness/execution-environment-cordis-contract')
  expect(Object.keys(root)).toEqual([])
})
