import type { ClientOf } from '@omne-harness/sdk/core'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import {
  attachWhile,
  needPoint,
  needProtocol,
  serviceKey,
  type ItemOf,
  type ServiceKey,
} from '@omne-harness/shell-contract'
import {
  defineUiModule,
  type ShellService,
  type UiModuleDefinition,
} from '@omne-harness/shell-contract/cordis'
import { Fragment, type ReactNode } from 'react'
import { ArchiveStore } from './model/archive.ts'
import { BlockReads, type BlockReadsSource } from './model/block-reads.ts'
import { toolCallState, toolResultText, type BlockSource } from './model/conversation.ts'
import { EntryFocus } from './model/entry-focus.ts'
import { SessionFigure } from './model/figure.ts'
import { HistorySearchStore } from './model/history-search.ts'
import { BackgroundCallsStore } from './model/background-calls.ts'
import { ComposerDraftStore, type ComposerDrafts } from './model/composer-drafts.ts'
import { ModelSelectionStore, type ModelChoiceSource } from './model/model-selection.ts'
import { PermissionModeStore } from './model/permission-mode.ts'
import { SessionWorkStore } from './model/session-work.ts'
import { SessionWorkspaces } from './model/session-workspaces.ts'
import { WorkspaceSelectionStore, type WorkspaceChoiceSource } from './model/workspace-selection.ts'
import {
  sessionBlockRender,
  sessionCallDetail,
  sessionRunFailure,
  sessionComposerAttachments,
  sessionDock,
  sessionSide,
  sessionStatus,
  sessionToolCall,
  type SessionRunFailureSubject,
} from './points.ts'
import { ArchiveAction, ArchivedSessions } from './view/archive.tsx'
import { BackgroundHint, SideWithBackground } from './view/background-pane.tsx'
import { Companion, COMPANION } from './view/companion.tsx'
import { ConversationPage } from './view/conversation-page.tsx'
import { FigureReport } from './view/figure-report.tsx'
import { ReadBlock } from './view/read-block.tsx'
import { HistorySearch } from './view/history-search.tsx'
import { ModelAction } from './view/model-selection.tsx'
import type { ToolCallPart } from './view/block-slot.ts'
import { PartDrawContext } from './view/part-draw.ts'
import { EntryFocusContext } from './view/shown-entry.ts'
import { PermissionModeAction } from './view/permission-mode.tsx'
import { SessionWork } from './view/session-work.tsx'
import { sessionParts } from './parts.ts'
import { SessionListPanel } from './view/session-list-panel.tsx'
import { SidePanel } from './view/side-panel.tsx'
import { WorkspaceAction } from './view/workspace-selection.tsx'

export const CONVERSATION_PAGE = 'conversation'
export const SESSION_LIST = 'session-list'
export const ARCHIVED_SESSIONS = 'archived-sessions'
export const HISTORY_SEARCH_PAGE = 'history-search'

/** What other modules provide that the session interface takes when the assembly names it; it works without each. */
export type SessionUiOptions = Readonly<{
  modelChoices?: ServiceKey<ModelChoiceSource>
  workspaceChoices?: ServiceKey<WorkspaceChoiceSource>
  blockReads?: ServiceKey<BlockReadsSource>
}>

/** Where a contribution to the composer gives back what the message being written carries. */
export const sessionComposerIntakeKey = serviceKey<ComposerDrafts>('session.composer-intake')

/** A block of a message drawn by whatever is put at its point, told what the model read of it. */
const SESSION_POINTS = [
  sessionDock,
  sessionSide,
  sessionStatus,
  sessionCallDetail,
  sessionComposerAttachments,
  sessionBlockRender,
  sessionToolCall,
  sessionRunFailure,
]

function blockDrawer(shell: ShellService, reads: BlockReads, scope: string | undefined) {
  return (
    session: string,
    kind: string,
    source: BlockSource,
    fallback: ReactNode,
    revision: string | null,
  ) => (
    <ReadBlock
      reads={reads}
      tenant={scope}
      session={session}
      revision={revision}
      message={source.message}
      block={source.block}
      draw={read =>
        sessionBlockRender.draw(
          shell,
          kind,
          { session, ...source, ...(read === undefined ? {} : { read }) },
          () => fallback,
        )
      }
    />
  )
}

// A call whose name is not generated yet has no key to draw by: the transcript draws its own line.
function toolCallDrawer(shell: ShellService) {
  return (session: string, part: ToolCallPart, generic: () => ReactNode): ReactNode =>
    part.name === null
      ? generic()
      : sessionToolCall.draw(
          shell,
          part.name,
          {
            session,
            call: part.callId,
            name: part.name,
            arguments: part.arguments,
            state: toolCallState(part),
            result: toolResultText(part),
          },
          generic,
        )
}

const fragments = (entries: readonly Readonly<{ id: string; node: ReactNode }>[]) =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

/** The places of the open session whose items stand one after another, as the page draws them. */
function placesOf(shell: ShellService) {
  return {
    dock: (session: string) => sessionDock.slot(shell, { session }, fragments),
    status: (session: string) => sessionStatus.slot(shell, { session }, fragments),
    failure: (subject: SessionRunFailureSubject) =>
      sessionRunFailure.slot(shell, subject, fragments),
  }
}

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

const shownOn = (shell: ShellService) => ({
  get: () => shell.page.get() === CONVERSATION_PAGE,
  subscribe: (listener: () => void) => shell.page.subscribe(listener),
})

function companionItem(
  shell: ShellService,
  workspaces: SessionWorkspaces,
  background: BackgroundCallsStore,
): ItemOf<'float'> {
  const show = (): void => shell.navigate(CONVERSATION_PAGE)
  return {
    id: COMPANION,
    order: 0,
    render: float => (
      <Companion
        workspaces={workspaces}
        background={background}
        shell={shell}
        float={float}
        onShow={show}
      />
    ),
  }
}

type ListGiven = Omit<Parameters<typeof SessionListPanel>[0], 'scope' | 'onShow'>

function listItem(shell: ShellService, given: ListGiven): ItemOf<'sidebar'> {
  const show = (): void => shell.navigate(CONVERSATION_PAGE)
  return {
    id: SESSION_LIST,
    order: 0,
    render: ({ scope }) => (
      <PartDrawContext.Provider value={shell}>
        <SessionListPanel {...given} scope={scope} onShow={show} />
      </PartDrawContext.Provider>
    ),
  }
}

const needsOf = (options: SessionUiOptions) => ({
  session: needProtocol<ClientOf<SessionProtocol>>(sessionProtocol),
  modelChoices: needPoint(options.modelChoices, { optional: true }),
  workspaceChoices: needPoint(options.workspaceChoices, { optional: true }),
  blockReads: needPoint(options.blockReads, { optional: true }),
})

const apply: UiModuleDefinition<ReturnType<typeof needsOf>>['apply'] = (
  shell,
  { session: client, modelChoices, workspaceChoices, blockReads },
  provide,
) => {
  for (const part of sessionParts) part.declare(shell)
  for (const point of SESSION_POINTS) point.declare(shell)
  const models = new ModelSelectionStore(client)
  const drafts = new ComposerDraftStore()
  provide(sessionComposerIntakeKey, drafts)
  const reads = new BlockReads()
  const places = new WorkspaceSelectionStore(client)
  const taken = [
    attachWhile(modelChoices, source => models.attach(source)),
    attachWhile(workspaceChoices, source => places.attach(source)),
    attachWhile(blockReads, source => reads.attach(source)),
  ]
  const workspaces = new SessionWorkspaces({ client })
  const background = new BackgroundCallsStore(client)
  const archive = new ArchiveStore(client)
  const modes = new PermissionModeStore(client)
  const held = new SessionWorkStore(client)
  const waitingCalls = waitingCallsOf(held)
  const search = new HistorySearchStore(client)
  const focus = new EntryFocus()
  const figure = new SessionFigure(report => shell.figure(report))
  const conversationShown = shownOn(shell)
  sessionDock.contribute(shell, {
    id: 'background-calls',
    order: 10,
    render: ({ scope, subject }) =>
      scope === undefined ? null : (
        <BackgroundHint store={background} tenant={scope} session={subject.session} />
      ),
  })
  shell.contribute('float', companionItem(shell, workspaces, background))
  shell.contribute('sidebar', listItem(shell, { workspaces, places, conversationShown }))
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
        <PartDrawContext.Provider value={shell}>
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
            {...placesOf(shell)}
            drafts={drafts}
            attachments={(session, draft) =>
              sessionComposerAttachments.slot(shell, { session, draft }, fragments)
            }
            block={blockDrawer(shell, reads, scope)}
            toolCall={toolCallDrawer(shell)}
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
        </PartDrawContext.Provider>
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
  return () => {
    for (const stop of taken) stop()
  }
}

export function createSessionUiModule(options: SessionUiOptions = {}) {
  return defineUiModule({ name: 'session-ui', needs: needsOf(options), apply })
}

export const sessionUiModule = createSessionUiModule()
