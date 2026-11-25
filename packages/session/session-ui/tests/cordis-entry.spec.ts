import { expect, it } from 'vitest'

it('Cordis 入口给出界面模块与读法的小模块、跳到对话页的对象写法、三个位置标识、八个拓展点与它们的名字、交模型与工作区列表的两个口、交回附件的口、给别的模块写输入框的口、读法的口和来源', async () => {
  const cordis = (await import('@omne-harness/session-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'CONVERSATION_PAGE',
    'SESSION_BLOCK_RENDER',
    'SESSION_CALL_DETAIL',
    'SESSION_COMPOSER_ATTACHMENTS',
    'SESSION_DOCK',
    'SESSION_LIST',
    'SESSION_RUN_FAILURE',
    'SESSION_SIDE',
    'SESSION_STATUS',
    'SESSION_TOOL_CALL',
    'conversationTarget',
    'createSessionUiModule',
    'sessionBlockRender',
    'sessionCallDetail',
    'sessionComposerAttachments',
    'sessionComposerIntakeKey',
    'sessionComposerKey',
    'sessionDock',
    'sessionParts',
    'sessionReadsSourceKey',
    'sessionReadsUiModule',
    'sessionRunFailure',
    'sessionSide',
    'sessionStatus',
    'sessionToolCall',
    'sessionUiModule',
  ])
  expect(cordis['sessionReadsSourceKey']).toBe('session.block-reads-source')
  expect(cordis['sessionReadsUiModule']).toMatchObject({
    name: 'session-reads-ui',
  })
  expect(cordis['SESSION_SIDE']).toBe('session.side')
  expect(cordis['sessionDock']).toMatchObject({ name: 'session.dock' })
  expect(cordis['sessionSide']).toMatchObject({ name: 'session.side' })
  expect(cordis['sessionUiModule']).toMatchObject({
    name: 'session-ui',
  })
  expect(cordis['SESSION_DOCK']).toBe('session.dock')
  expect(cordis['sessionCallDetail']).toMatchObject({ name: 'session.call-detail' })
  expect(cordis['SESSION_RUN_FAILURE']).toBe('session.run-failure')
  expect(cordis['sessionRunFailure']).toMatchObject({ name: 'session.run-failure' })
})
