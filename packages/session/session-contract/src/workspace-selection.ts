import type { WorkspaceId } from '@omne-harness/legal-identity'
import type { WorkSnapshot, WorkspaceAttachment } from './values.ts'

export type WorkspaceSelection = Readonly<{
  workspace: WorkspaceId
  attachment: WorkspaceAttachment
}>

type Selected = Readonly<{
  workspace: WorkspaceId | null
  attachment: WorkspaceAttachment | null | undefined
}>

const selectionOf = ({ workspace, attachment }: Selected): WorkspaceSelection | null =>
  workspace === null || attachment == null ? null : { workspace, attachment }

/** The workspace a session stands at: its last change, or what it was created with. Null: none. */
export function workspaceSelection(
  snapshot: Pick<WorkSnapshot, 'creation' | 'changes'>,
): WorkspaceSelection | null {
  const changed = snapshot.changes?.findLast(change => change.kind === 'workspace')
  if (changed?.kind === 'workspace')
    return selectionOf({ workspace: changed.value, attachment: changed.workspaceAttachment })
  const { workspace, workspaceAttachment } = snapshot.creation
  return selectionOf({ workspace, attachment: workspaceAttachment })
}
