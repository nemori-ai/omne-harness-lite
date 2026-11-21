import { expect, it } from 'vitest'

it('Cordis 入口给出界面模块与读法的小模块、客户端服务名、三个位置标识、六个拓展点与它们的名字、交模型与工作区列表的两个口、交回附件的口与读法的口和来源', async () => {
  const cordis = (await import('@omne-harness/session-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'CONVERSATION_PAGE',
    'SESSION_BLOCK',
    'SESSION_CALL_DETAIL',
    'SESSION_COMPOSER_ATTACHMENTS',
    'SESSION_DOCK',
    'SESSION_LIST',
    'SESSION_SIDE',
    'SESSION_STATUS',
    'sessionBlock',
    'sessionBlockReadsKey',
    'sessionCallDetail',
    'sessionClientService',
    'sessionComposerAttachments',
    'sessionComposerIntakeKey',
    'sessionDock',
    'sessionModelChoicesKey',
    'sessionReadsSourceKey',
    'sessionReadsUiModule',
    'sessionSide',
    'sessionStatus',
    'sessionUiModule',
    'sessionWorkspaceChoicesKey',
  ])
  expect(cordis['sessionModelChoicesKey']).toBe('session.model-choices')
  expect(cordis['sessionWorkspaceChoicesKey']).toBe('session.workspace-choices')
  expect(cordis['sessionBlockReadsKey']).toBe('session.block-reads')
  expect(cordis['sessionReadsSourceKey']).toBe('session.block-reads-source')
  expect(cordis['sessionReadsUiModule']).toMatchObject({
    name: 'session-reads-ui',
    inject: ['shell', 'protocol:session-diagnostics/v1'],
  })
  expect(cordis['SESSION_SIDE']).toBe('session.side')
  expect(cordis['sessionDock']).toMatchObject({ name: 'session.dock' })
  expect(cordis['sessionSide']).toMatchObject({ name: 'session.side' })
  expect(cordis['sessionUiModule']).toMatchObject({
    name: 'session-ui',
    inject: ['shell', 'protocol:session/v1'],
  })
  expect(cordis['SESSION_DOCK']).toBe('session.dock')
  expect(cordis['sessionCallDetail']).toMatchObject({ name: 'session.call-detail' })
})
