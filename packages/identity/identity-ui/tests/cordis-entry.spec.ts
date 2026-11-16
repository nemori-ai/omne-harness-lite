import { expect, it } from 'vitest'

it('Cordis 入口只给出界面模块', async () => {
  const cordis = (await import('@omne-harness/identity-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['identityUiModule'])
  expect(cordis['identityUiModule']).toMatchObject({
    name: 'identity-ui',
    inject: ['shell', 'protocol:identity/v1'],
  })
})
