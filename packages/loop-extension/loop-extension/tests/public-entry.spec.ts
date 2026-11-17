import { expect, it } from 'vitest'

it('exports the view rules, the gathering of the facts and the members of a position', async () => {
  const root = (await import('@omne-harness/loop-extension')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'enabledView',
    'gatherFacts',
    'implementationOf',
    'memberOfImplementation',
    'membersAt',
  ])
})
