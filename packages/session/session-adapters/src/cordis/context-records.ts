import type { ContextBlockKey, ScopeRef } from '@omne-harness/runtime-context-contract'
import type { DeclarationChange } from '@omne-harness/session-contract'
import { decodeStep, materialValue, open } from './context-input.ts'

/** A block of a scope as the session log holds it: registered there, and its last commit. */
export type HeldBlock =
  | Readonly<{ kind: 'not-held' }>
  | Readonly<{ kind: 'held'; committed: Readonly<{ value: unknown }> | null }>

type Recorded = Readonly<{ scope: string; declaration: DeclarationChange }>
type Registration = Extract<DeclarationChange, { kind: 'context-registration' }>
type StepCommitted = Extract<DeclarationChange, { kind: 'context-step-commit' }>

// An add brings the block, a remove takes it away. An add made before the definition declared the
// block brings it too: recovery reads it with the declaration the definition has now.
function registrationOf(declaration: Registration, key: ContextBlockKey): boolean | null {
  const need = open(materialValue(declaration.need, 'need'), 'need')
  if (need['key'] !== key) return null
  if (need['kind'] === 'add') return true
  return need['kind'] === 'remove' ? false : null
}

function committedIn(declaration: StepCommitted, key: ContextBlockKey) {
  const block = decodeStep(declaration.updates).stepCommit.committed.find(item => item.key === key)
  return block === undefined ? null : { value: block.value }
}

/** Reads the log, not Runtime Context: what the session committed is what recovery puts back. */
export function heldBlock(
  records: readonly Recorded[],
  scope: ScopeRef,
  key: ContextBlockKey,
): HeldBlock {
  let held = false
  let committed: Readonly<{ value: unknown }> | null = null
  for (const { scope: recorded, declaration } of records) {
    if (recorded !== scope.ref) continue
    if (declaration.kind === 'context-registration') {
      const registered = registrationOf(declaration, key)
      if (registered === null) continue
      held = registered
      committed = null
    } else if (declaration.kind === 'context-step-commit')
      committed = committedIn(declaration, key) ?? committed
  }
  return held ? { kind: 'held', committed } : { kind: 'not-held' }
}
