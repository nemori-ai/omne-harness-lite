export type AssetVersionSelection =
  | Readonly<{ kind: 'follow' }>
  | Readonly<{ kind: 'pinned'; version: string }>
export type AssetHolding = Readonly<{
  holdingRef: string
  scopeRef: string
  assetRef: string
  category: string
  name: string
  revision: number
  state: 'held' | 'removed'
  selection: AssetVersionSelection
}>
export type AssetHoldingChange =
  | Readonly<{ kind: 'remove'; expectedRevision: number }>
  | Readonly<{ kind: 'selectVersion'; expectedRevision: number; selection: AssetVersionSelection }>
export type AssetHoldingDecision =
  | Readonly<{ kind: 'changed' | 'no_change'; holding: AssetHolding }>
  | Readonly<{ kind: 'rejected'; reason: 'revision_conflict' | 'removed' | 'invalid_selection' }>

/** The owner supplies current qualification separately. Removing a holding never deletes work. */
export function decideAssetHoldingChange(
  holding: AssetHolding,
  change: AssetHoldingChange,
): AssetHoldingDecision {
  if (holding.revision !== change.expectedRevision)
    return { kind: 'rejected', reason: 'revision_conflict' }
  if (holding.state === 'removed')
    return change.kind === 'remove'
      ? { kind: 'no_change', holding }
      : { kind: 'rejected', reason: 'removed' }
  if (change.kind === 'selectVersion') {
    const selected = change.selection
    if (selected.kind === 'pinned' && selected.version.length === 0)
      return { kind: 'rejected', reason: 'invalid_selection' }
    if (
      selected.kind === holding.selection.kind &&
      (selected.kind === 'follow' ||
        (holding.selection.kind === 'pinned' && selected.version === holding.selection.version))
    )
      return { kind: 'no_change', holding }
    return {
      kind: 'changed',
      holding: Object.freeze({
        ...holding,
        revision: holding.revision + 1,
        selection: Object.freeze({ ...selected }),
      }),
    }
  }
  return {
    kind: 'changed',
    holding: Object.freeze({ ...holding, revision: holding.revision + 1, state: 'removed' }),
  }
}
