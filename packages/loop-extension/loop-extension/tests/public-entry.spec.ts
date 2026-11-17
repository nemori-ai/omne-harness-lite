import { expect, it } from 'vitest'

it('exports the view rules, the members of a position and the result of a command run', async () => {
  const root = (await import('@omne-harness/loop-extension')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'enabledView',
    'implementationOf',
    'memberOfImplementation',
    'membersAt',
  ])
})
