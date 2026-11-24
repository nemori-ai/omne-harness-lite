import type { WorkspaceDirectoryVisit } from './values.ts'

/** Reduce confirmed directory visits for the selected binding. The log retains every original visit. */
export function activeWorkspaceVisit(
  previous: WorkspaceDirectoryVisit | undefined,
  visit: WorkspaceDirectoryVisit,
): WorkspaceDirectoryVisit {
  const sameBinding =
    previous?.generation === visit.generation &&
    previous.workspace === visit.workspace &&
    previous.instance === visit.instance
  const existing = sameBinding ? previous.directories : []
  return { ...visit, directories: [...new Set([...existing, ...visit.directories])].sort() }
}
