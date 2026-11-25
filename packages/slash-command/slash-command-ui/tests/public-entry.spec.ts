import { expect, it } from 'vitest'

it('the public entry opens a helper on a session; the shapes of a composer are types only', async () => {
  const root = (await import('@omne-harness/slash-command-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['openHelper'])
})
