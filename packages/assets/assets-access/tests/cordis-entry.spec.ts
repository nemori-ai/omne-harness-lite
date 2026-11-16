import { expect, it } from 'vitest'

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/assets-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createAssetsAccessPlugin'])
})
