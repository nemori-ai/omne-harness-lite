import { expect, it } from 'vitest'

it('Cordis 入口给出界面模块、客户端服务名与三个位置标识', async () => {
  const cordis = (await import('@omne-harness/session-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'CONVERSATION_PAGE',
    'SESSION_DOCK',
    'SESSION_LIST',
    'sessionClientService',
    'sessionUiModule',
  ])
  expect(cordis['sessionUiModule']).toMatchObject({
    name: 'session-ui',
    inject: ['shell', 'protocol:session/v1'],
  })
  expect(cordis['SESSION_DOCK']).toBe('session.dock')
})
