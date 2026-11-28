import {
  stepList,
  UNREAD,
  type ListEffect,
  type ListEvent,
  type SessionList,
} from './session-list.ts'
import { INITIAL, step, underWay, type Effect, type Event, type State } from './session-machine.ts'

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

function isActivity(before: State, after: State): boolean {
  if (before.kind === 'creating') return after.kind === 'open'
  if (before.kind !== 'open' || after.kind !== 'open' || before.session !== after.session)
    return false
  if (underWay(before.run) && after.run.kind === 'idle') return true
  const accepted = new Set(
    before.inputs.filter(input => input.status === 'accepted').map(input => input.acceptId),
  )
  return after.inputs.some(input => input.status === 'accepted' && !accepted.has(input.acceptId))
}
