import { expect, it } from 'vitest'

it('draft public entries export nothing until the accepted contract replaces them', async () => {
  const root = (await import('@omne-harness/pi-ai-transport')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
