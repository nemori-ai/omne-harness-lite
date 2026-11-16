import { expect, it } from 'vitest'

it('Cordis 入口给出界面模块的工厂、选项类型与页面的标识、次序', async () => {
  const cordis = (await import('@omne-harness/human-intervention-ui/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual([
    'PAGE_ID',
    'PAGE_ORDER',
    'createHumanInterventionUiModule',
  ])
  expect(cordis['PAGE_ID']).toBe('decisions')
  expect(cordis['PAGE_ORDER']).toBe(10)
  const create = cordis['createHumanInterventionUiModule'] as () => unknown
  expect(create()).toMatchObject({
    name: 'human-intervention-ui',
    inject: ['shell', 'protocol:human-intervention/v1'],
  })
})
