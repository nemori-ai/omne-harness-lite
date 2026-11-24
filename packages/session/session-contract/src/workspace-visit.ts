import { workspaceCodec } from '@omne-harness/legal-identity'
import type { ConsumptionId } from './identity.ts'
import { workspaceGeneration, workspaceSelection } from './workspace-selection.ts'
import type { WorkSnapshot, WorkspaceDirectoryVisit } from './values.ts'

/** Reduce confirmed directory visits for the selected binding. The log retains every original visit. */
export function activeWorkspaceVisit(
  previous: WorkspaceDirectoryVisit | undefined,
  visit: WorkspaceDirectoryVisit,
): WorkspaceDirectoryVisit {
  const sameBinding =
    previous?.generation === visit.generation &&
    previous.workspace === visit.workspace &&
    previous.instance === visit.instance
  const batch = visit.batch ?? (sameBinding ? previous.batch : undefined)
  const existing = sameBinding && previous.batch === batch ? previous.directories : []
  return {
    ...visit,
    ...(batch === undefined ? {} : { batch }),
    directories: [...new Set([...existing, ...visit.directories])].sort(),
  }
}

type VisitState = Pick<WorkSnapshot, 'creation' | 'changes'> & {
  -readonly [K in 'workspaceVisit' | 'workspaceBackgroundVisits']?: NonNullable<WorkSnapshot[K]>
}

/** A foreground batch and each unresolved background outcome have independent lifetimes. */
export function applyWorkspaceVisit(
  state: VisitState,
  consumption: ConsumptionId,
  visit: WorkspaceDirectoryVisit,
): void {
  const selection = workspaceSelection(state)
  if (selection === null || selection.attachment.instance !== visit.instance) return
  const workspace = workspaceCodec.encode(selection.workspace)
  if (
    !workspace.ok ||
    workspace.value !== visit.workspace ||
    workspaceGeneration(state) !== visit.generation
  )
    return
  if (visit.batch !== undefined) {
    state.workspaceVisit = activeWorkspaceVisit(state.workspaceVisit, visit)
    return
  }
  const pending = [...(state.workspaceBackgroundVisits ?? [])]
  const index = pending.findIndex(item => item.consumption === consumption)
  if (index < 0) pending.push({ consumption, visit })
  else pending[index] = { ...pending[index]!, visit }
  state.workspaceBackgroundVisits = pending
}
