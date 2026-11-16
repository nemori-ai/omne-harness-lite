import { expect, it } from 'vitest'

it('根入口只给出这一页', async () => {
  const root = (await import('@omne-harness/human-intervention-ui')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['DecisionsPage'])
})
