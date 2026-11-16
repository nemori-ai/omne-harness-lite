import { expect, it } from 'vitest'

it('the root entry exports only the handler factory and the reply identity', async () => {
  const root = (await import('@omne-harness/human-intervention-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createHitlContribution', 'hitlReplyIdentity'])
})
