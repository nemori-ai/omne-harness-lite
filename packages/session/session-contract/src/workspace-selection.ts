import type { WorkspaceId } from '@omne-harness/legal-identity'
import type { DeclarationChange, WorkSnapshot, WorkspaceAttachment } from './values.ts'

export type WorkspaceSelection = Readonly<{
  workspace: WorkspaceId
  attachment: WorkspaceAttachment
}>

type WorkspaceChange = Extract<DeclarationChange, { kind: 'workspace' }>

/** The workspace a session stands at: its last change, or what it was created with. Null: none. */
export function workspaceSelection(
  snapshot: Pick<WorkSnapshot, 'creation' | 'changes'>,
): WorkspaceSelection | null {
  const changed = snapshot.changes?.findLast(
    (change): change is WorkspaceChange => change.kind === 'workspace',
  )
  const { workspace, workspaceAttachment } = snapshot.creation
  // A workspace is committed with its attachment or not at all: the commands are judged so.
  const [selected, attachment] =
    changed === undefined
      ? [workspace, workspaceAttachment]
      : [changed.value, changed.workspaceAttachment]
  return selected === null
    ? null
    : { workspace: selected, attachment: attachment as WorkspaceAttachment }
}

/** Returning to the same instance starts a new binding after an intervening selection. */
export function workspaceGeneration(snapshot: Pick<WorkSnapshot, 'creation' | 'changes'>): string {
  let previous = snapshot.creation.workspaceAttachment?.instance ?? null
  let previousWorkspace = snapshot.creation.workspace
  let generation = 0
  for (const change of snapshot.changes ?? []) {
    if (change.kind !== 'workspace') continue
    const next = change.workspaceAttachment?.instance ?? null
    if (next !== previous || change.value?.text !== previousWorkspace?.text) generation++
    previous = next
    previousWorkspace = change.value
  }
  return String(generation)
}
