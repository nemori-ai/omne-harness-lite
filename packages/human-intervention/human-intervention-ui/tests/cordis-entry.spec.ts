import { expect, it } from 'vitest'

it('Cordis 入口只给出界面模块', async () => {
  const cordis = (await import('@omne-harness/human-intervention-ui/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis)).toEqual(['humanInterventionUiModule'])
  expect(cordis['humanInterventionUiModule']).toMatchObject({
    name: 'human-intervention-ui',
    inject: ['shell', 'protocol:human-intervention/v1'],
  })
})
