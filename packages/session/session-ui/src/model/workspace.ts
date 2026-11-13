// The session axis and the session list side by side (SPEC.md「会话管理」). Each event goes to the
// axis it belongs to. The only coupling: an activity seen on the session axis reloads the list.
import {
  stepList,
  UNREAD,
  type ListEffect,
  type ListEvent,
  type SessionList,
} from './session-list.ts'
import { INITIAL, step, type Effect, type Event, type State } from './session-machine.ts'

export type Workspace = Readonly<{ session: State; list: SessionList }>
export type WorkspaceEvent = Event | ListEvent
export type WorkspaceEffect = Effect | ListEffect
export type WorkspaceStep = Readonly<{
  workspace: Workspace
  effects: readonly WorkspaceEffect[]
}>

export const INITIAL_WORKSPACE: Workspace = { session: INITIAL, list: UNREAD }

function isListEvent(event: WorkspaceEvent): event is ListEvent {
  return event.kind === 'list-load' || event.kind === 'list-more' || event.kind === 'list-read'
}

export function stepWorkspace(workspace: Workspace, event: WorkspaceEvent): WorkspaceStep {
  if (isListEvent(event)) {
    const next = stepList(workspace.list, event)
    return next.list === workspace.list
      ? { workspace, effects: [] }
      : { workspace: { ...workspace, list: next.list }, effects: next.effects }
  }
  const next = step(workspace.session, event)
  if (next.state === workspace.session) return { workspace, effects: next.effects }
  if (!isActivity(workspace.session, next.state))
    return { workspace: { ...workspace, session: next.state }, effects: next.effects }
  const reload = stepList(workspace.list, { kind: 'list-load' })
  return {
    workspace: { session: next.state, list: reload.list },
    effects: [...next.effects, ...reload.effects],
  }
}

/**
 * The three commits the server counts as activity (RFC-0015 §8「列出会话」), as the session axis
 * sees them: a create that succeeded, an input newly accepted, a run that ended. Judged from the
 * states, so a stale answer, which leaves the state as it was, never counts.
 */
function isActivity(before: State, after: State): boolean {
  if (before.kind === 'creating') return after.kind === 'open'
  if (before.kind !== 'open' || after.kind !== 'open' || before.session !== after.session)
    return false
  if (before.run.kind !== 'idle' && after.run.kind === 'idle') return true
  const accepted = new Set(
    before.inputs.filter(input => input.status === 'accepted').map(input => input.acceptId),
  )
  return after.inputs.some(input => input.status === 'accepted' && !accepted.has(input.acceptId))
}
