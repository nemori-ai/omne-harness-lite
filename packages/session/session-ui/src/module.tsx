import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import { serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { Fragment, type ReactNode } from 'react'
import { ArchiveStore } from './model/archive.ts'
import { BlockReads, type BlockReadsHolder } from './model/block-reads.ts'
import type { BlockSource } from './model/conversation.ts'
import { EntryFocus } from './model/entry-focus.ts'
import { SessionFigure } from './model/figure.ts'
import { HistorySearchStore } from './model/history-search.ts'
import { BackgroundCallsStore } from './model/background-calls.ts'
import { ComposerDraftStore, type ComposerDrafts } from './model/composer-drafts.ts'
import { ModelSelectionStore, type ModelChoiceHolder } from './model/model-selection.ts'
import { PermissionModeStore } from './model/permission-mode.ts'
import { SessionWorkStore } from './model/session-work.ts'
import { SessionWorkspaces } from './model/session-workspaces.ts'
import { WorkspaceSelectionStore, type WorkspaceChoiceHolder } from './model/workspace-selection.ts'
import {
  sessionBlock,
  sessionCallDetail,
  sessionComposerAttachments,
  sessionDock,
  sessionSide,
  sessionStatus,
} from './points.ts'
import { ArchiveAction, ArchivedSessions } from './view/archive.tsx'
import { BackgroundHint, SideWithBackground } from './view/background-pane.tsx'
import { ConversationPage } from './view/conversation-page.tsx'
import { FigureReport } from './view/figure-report.tsx'
import { ReadBlock } from './view/read-block.tsx'
import { HistorySearch } from './view/history-search.tsx'
import { ModelAction } from './view/model-selection.tsx'
import { EntryFocusContext } from './view/shown-entry.ts'
import { PermissionModeAction } from './view/permission-mode.tsx'
import { SessionWork } from './view/session-work.tsx'
import { SessionListPanel } from './view/session-list-panel.tsx'
import { SidePanel } from './view/side-panel.tsx'
import { WorkspaceAction } from './view/workspace-selection.tsx'

export const sessionClientService = protocolServiceName({
  name: sessionProtocol.name,
  major: sessionProtocol.major,
})

export const CONVERSATION_PAGE = 'conversation'
export const SESSION_LIST = 'session-list'
export const ARCHIVED_SESSIONS = 'archived-sessions'
export const HISTORY_SEARCH_PAGE = 'history-search'

/** Where a list of models is handed to the session interface; it works without one. */
export const sessionModelChoicesKey = serviceKey<ModelChoiceHolder>('session.model-choices')
/** Where a list of workspaces is handed to the session interface; it works without one. */
export const sessionWorkspaceChoicesKey = serviceKey<WorkspaceChoiceHolder>(
  'session.workspace-choices',
)

/** Where the reads of the blocks are handed to the session interface; it works without them. */
export const sessionBlockReadsKey = serviceKey<BlockReadsHolder>('session.block-reads')

/** Where a contribution to the composer gives back what the message being written carries. */
export const sessionComposerIntakeKey = serviceKey<ComposerDrafts>('session.composer-intake')

/** A block of a message drawn by whatever is put at its point, told what the model read of it. */
const SESSION_POINTS = [
  sessionDock,
  sessionSide,
  sessionStatus,
  sessionCallDetail,
  sessionComposerAttachments,
  sessionBlock,
]

function blockDrawer(shell: ShellService, reads: BlockReads, scope: string | undefined) {
  return (session: string, source: BlockSource, fallback: ReactNode, revision: string | null) => (
    <ReadBlock
      reads={reads}
      tenant={scope}
      session={session}
      revision={revision}
      message={source.message}
      block={source.block}
      draw={read =>
        sessionBlock.slot(
          shell,
          { session, ...source, ...(read === undefined ? {} : { read }) },
          entries =>
            entries.length === 0
              ? fallback
              : entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>),
        )
      }
    />
  )
}

const fragments = (entries: readonly Readonly<{ id: string; node: ReactNode }>[]) =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

// The composer reads how many calls wait for a person from what the session work last read; it asks nothing.
function waitingCallsOf(held: SessionWorkStore) {
  return {
    subscribe: (tenant: string, session: string, listener: () => void) =>
      held.subscribe(tenant, session, listener),
    count: (tenant: string, session: string) => {
      const calls = held.read(tenant, session).calls
      return calls.kind === 'read' ? calls.items.length : 0
    },
  }
}

export const sessionUiModule = defineUiModule<Record<string, ClientOf<SessionProtocol>>>({
  name: 'session-ui',
  inject: [sessionClientService],
  apply(shell, services, provide) {
    for (const point of SESSION_POINTS) point.declare(shell)
    const client = services[sessionClientService]!
    const models = new ModelSelectionStore(client)
    provide(sessionModelChoicesKey, models)
    const drafts = new ComposerDraftStore()
    provide(sessionComposerIntakeKey, drafts)
    const reads = new BlockReads()
    provide(sessionBlockReadsKey, reads)
    const places = new WorkspaceSelectionStore(client)
    provide(sessionWorkspaceChoicesKey, places)
    const workspaces = new SessionWorkspaces({ client })
    const background = new BackgroundCallsStore(client)
    const archive = new ArchiveStore(client)
    const modes = new PermissionModeStore(client)
    const held = new SessionWorkStore(client)
    const waitingCalls = waitingCallsOf(held)
    const search = new HistorySearchStore(client)
    const focus = new EntryFocus()
    const figure = new SessionFigure(report => shell.figure(report))
    const conversationShown = {
      get: () => shell.page.get() === CONVERSATION_PAGE,
      subscribe: (listener: () => void) => shell.page.subscribe(listener),
    }
    sessionDock.contribute(shell, {
      id: 'background-calls',
      order: 10,
      render: ({ scope, subject }) =>
        scope === undefined ? null : (
          <BackgroundHint store={background} tenant={scope} session={subject.session} />
        ),
    })
    shell.contribute('sidebar', {
      id: SESSION_LIST,
      order: 0,
      render: ({ scope }) => (
        <SessionListPanel
          workspaces={workspaces}
          places={places}
          scope={scope}
          onShow={() => shell.navigate(CONVERSATION_PAGE)}
          conversationShown={conversationShown}
        />
      ),
    })
    shell.contribute('sidebar', {
      id: ARCHIVED_SESSIONS,
      order: 1,
      render: ({ scope }) =>
        scope === undefined ? null : (
          <ArchivedSessions store={archive} workspaces={workspaces} tenant={scope} />
        ),
    })
    shell.contribute('pages', {
      id: CONVERSATION_PAGE,
      title: '对话',
      order: 0,
      icon: 'conversation',
      render: ({ scope }) => (
        <EntryFocusContext.Provider value={focus}>
          <FigureReport
            workspaces={workspaces}
            scope={scope}
            background={background}
            figure={figure}
          />
          <ConversationPage
            workspaces={workspaces}
            scope={scope}
            work={(session, revision) =>
              scope === undefined ? null : (
                <SessionWork store={held} tenant={scope} session={session} revision={revision} />
              )
            }
            heading={session =>
              scope === undefined ? null : (
                <>
                  <ModelAction store={models} tenant={scope} session={session} />
                  <WorkspaceAction store={places} tenant={scope} session={session} />
                  <PermissionModeAction store={modes} tenant={scope} session={session} />
                </>
              )
            }
            more={(session, say) =>
              scope === undefined ? null : (
                <ArchiveAction
                  store={archive}
                  workspaces={workspaces}
                  tenant={scope}
                  session={session}
                  say={say}
                />
              )
            }
            waitingCalls={waitingCalls}
            dock={session => sessionDock.slot(shell, { session }, fragments)}
            status={session => sessionStatus.slot(shell, { session }, fragments)}
            drafts={drafts}
            attachments={(session, draft) =>
              sessionComposerAttachments.slot(shell, { session, draft }, fragments)
            }
            block={blockDrawer(shell, reads, scope)}
            side={session =>
              sessionSide.slot(shell, { session }, entries =>
                scope === undefined ? (
                  <SidePanel entries={entries} />
                ) : (
                  <SideWithBackground
                    entries={entries}
                    store={background}
                    tenant={scope}
                    session={session}
                    detail={call => sessionCallDetail.slot(shell, { session, call }, fragments)}
                  />
                ),
              )
            }
          />
        </EntryFocusContext.Provider>
      ),
    })
    shell.contribute('pages', {
      id: HISTORY_SEARCH_PAGE,
      title: '搜索',
      order: 1,
      icon: 'search',
      group: 'utility',
      render: ({ scope }) => (
        <HistorySearch
          store={search}
          workspaces={workspaces}
          scope={scope}
          onShow={(session, entry) => {
            focus.set({ session, entry })
            shell.navigate(CONVERSATION_PAGE)
          }}
        />
      ),
    })
  },
})
