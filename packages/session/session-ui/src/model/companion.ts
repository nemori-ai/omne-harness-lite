import type { FigureDoing } from '@omne-harness/shell-contract'
import type { CompanionSession } from '../parts.ts'
import { figureDoing } from './figure.ts'
import { sessionName, shownBy, type ListPage } from './session-list.ts'
import type { Workspace } from './workspace.ts'

/** What the companion shows of the workspace: it changes only when one of these does, not with every frame. */
export type CompanionFacts = Readonly<{
  page: ListPage | null
  sessions: readonly CompanionSession[] | null
  current: string | null
  /** The open session, when it can be asked what runs in its background. */
  live: string | null
  doing: FigureDoing
}>

export function companionFacts(workspace: Workspace, was: CompanionFacts | null): CompanionFacts {
  const state = workspace.session
  const page = shownBy(workspace.list)
  const live = state.kind === 'open' ? state.session : null
  const current = state.kind === 'unavailable' ? state.session : live
  const doing = figureDoing(state, false)
  if (was !== null && was.page === page && was.current === current && was.live === live)
    if (was.doing === doing) return was
  const sessions =
    page === null
      ? null
      : page.sessions.map(item => ({ session: item.session, name: sessionName(item) }))
  return { page, sessions, current, live, doing }
}
