import { expect, it } from 'vitest'

it('the root entry exports the answering of requests, without Cordis', async () => {
  const root = (await import('@omne-harness/interface-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['answerNow', 'answerRequests', 'measure', 'waitFor'])
})
