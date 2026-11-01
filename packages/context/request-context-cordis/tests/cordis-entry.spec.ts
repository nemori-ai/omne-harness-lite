import { expect, it } from 'vitest'

it('the cordis entry exports only the provider', async () => {
  const cordis = (await import('@omne-harness/request-context-cordis/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis)).toEqual(['RequestContextProvider'])
})
