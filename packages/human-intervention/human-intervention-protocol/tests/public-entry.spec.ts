import { expect, it } from 'vitest'

it('the root entry exports only the human-intervention/v1 contract', async () => {
  const root = (await import('@omne-harness/human-intervention-protocol')) as Record<
    string,
    unknown
  >
  expect(Object.keys(root)).toEqual(['humanInterventionProtocol'])
})
