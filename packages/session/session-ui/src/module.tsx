import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { SessionWorkspaces } from './model/session-workspaces.ts'
import { ConversationPage } from './view/conversation-page.tsx'
import { SessionListPanel } from './view/session-list-panel.tsx'

export const sessionClientService = protocolServiceName({
  name: sessionProtocol.name,
  major: sessionProtocol.major,
})

export const CONVERSATION_PAGE = 'conversation'
export const SESSION_LIST = 'session-list'
export const SESSION_DOCK = 'session.dock'

export const sessionUiModule = defineUiModule<Record<string, ClientOf<SessionProtocol>>>({
  name: 'session-ui',
  inject: [sessionClientService],
  apply(shell, services) {
    const workspaces = new SessionWorkspaces({ client: services[sessionClientService]! })
    shell.contribute('sidebar', {
      id: SESSION_LIST,
      order: 0,
      render: ({ scope }) => (
        <SessionListPanel
          workspaces={workspaces}
          scope={scope}
          onShow={() => shell.navigate(CONVERSATION_PAGE)}
        />
      ),
    })
    shell.contribute('pages', {
      id: CONVERSATION_PAGE,
      title: '对话',
      order: 0,
      icon: 'conversation',
      render: ({ scope }) => (
        <ConversationPage
          workspaces={workspaces}
          scope={scope}
          dock={session => shell.attached(SESSION_DOCK, session)}
        />
      ),
    })
  },
})
