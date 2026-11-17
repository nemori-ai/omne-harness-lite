import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { Fragment } from 'react'
import { SessionWorkspaces } from './model/session-workspaces.ts'
import { sessionDock, sessionSide } from './points.ts'
import { ConversationPage } from './view/conversation-page.tsx'
import { SessionListPanel } from './view/session-list-panel.tsx'
import { SidePanel } from './view/side-panel.tsx'

export const sessionClientService = protocolServiceName({
  name: sessionProtocol.name,
  major: sessionProtocol.major,
})

export const CONVERSATION_PAGE = 'conversation'
export const SESSION_LIST = 'session-list'

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
          dock={session =>
            sessionDock.slot(shell, { session }, entries =>
              entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>),
            )
          }
          side={session =>
            sessionSide.slot(shell, { session }, entries => <SidePanel entries={entries} />)
          }
        />
      ),
    })
  },
})
