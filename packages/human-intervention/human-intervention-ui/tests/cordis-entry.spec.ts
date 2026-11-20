import { expect, it } from 'vitest'

it('Cordis 入口给出界面模块的工厂、选项类型、页面的标识与次序，以及放行详情按种类的点', async () => {
  const cordis = (await import('@omne-harness/human-intervention-ui/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual([
    'PAGE_ID',
    'PAGE_ORDER',
    'createHumanInterventionUiModule',
    'releaseDetail',
  ])
  expect(cordis['PAGE_ID']).toBe('decisions')
  expect(cordis['PAGE_ORDER']).toBe(10)
  expect((cordis['releaseDetail'] as { name: string }).name).toBe(
    'human-intervention.release-detail',
  )
  const create = cordis['createHumanInterventionUiModule'] as () => unknown
  expect(create()).toMatchObject({
    name: 'human-intervention-ui',
    inject: ['shell', 'protocol:human-intervention/v1'],
  })
})
