import { expect, it } from 'vitest'

it('Cordis 入口给出界面模块、客户端服务名、两个位置标识、两个拓展点与它们的名字', async () => {
  const cordis = (await import('@omne-harness/session-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'CONVERSATION_PAGE',
    'SESSION_DOCK',
    'SESSION_LIST',
    'SESSION_SIDE',
    'sessionClientService',
    'sessionDock',
    'sessionSide',
    'sessionUiModule',
  ])
  expect(cordis['SESSION_SIDE']).toBe('session.side')
  expect(cordis['sessionDock']).toMatchObject({ name: 'session.dock' })
  expect(cordis['sessionSide']).toMatchObject({ name: 'session.side' })
  expect(cordis['sessionUiModule']).toMatchObject({
    name: 'session-ui',
    inject: ['shell', 'protocol:session/v1'],
  })
  expect(cordis['SESSION_DOCK']).toBe('session.dock')
})
