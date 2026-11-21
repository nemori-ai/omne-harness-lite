import {
  decide,
  govern,
  standingOf,
  type RelationOperation,
} from '@omne-harness/workspace-contract'
import type { WorkspaceTxn } from '../txn.ts'
import { once, type Named, type ScriptResult } from './script.ts'

/** `target` is the tenant whose relation changes. Leaving changes the caller's own, whatever is named. */
export type RelationCommand = Named &
  Readonly<{ workspace: string; change: RelationOperation; target: string }>
export type RelationResult = ScriptResult<null>

export type DestroyCommand = Named & Readonly<{ workspace: string }>
export type DestroyResult = ScriptResult<null>

/** One relation changes, or nothing does. A workspace that is not there answers the same as no relation. */
export function changeRelation(txn: WorkspaceTxn, command: RelationCommand): RelationResult {
  return once(txn, command, command.change, () => {
    const { workspace, tenant, change } = command
    const record = txn.workspace(workspace)
    if (record === null) return { kind: 'not-permitted' }
    const target = change === 'leave' ? tenant : command.target
    const decision = govern(
      standingOf(txn.relation(workspace, tenant)),
      change,
      standingOf(txn.relation(workspace, target)),
    )
    if (decision.kind === 'not-permitted' || decision.kind === 'not-performed') return decision
    if (decision.kind === 'unchanged') return { kind: 'done', value: null, changed: false }
    if (decision.kind === 'set') txn.putRelation(workspace, target, decision.relation)
    else txn.endRelation(workspace, target)
    txn.bumpSource(workspace, target)
    txn.setRevision(workspace, record.revision + 1)
    return { kind: 'done', value: null, changed: true }
  })
}

/** One commit ends every relation and every association. Nobody is related to it afterwards, so nobody reads it. */
export function destroyWorkspace(txn: WorkspaceTxn, command: DestroyCommand): DestroyResult {
  return once(txn, command, 'destroy', () => {
    const { workspace, tenant } = command
    const caller = standingOf(txn.relation(workspace, tenant))
    if (decide(caller, 'destroy') !== 'allow') return { kind: 'not-permitted' }
    txn.bumpSources(workspace)
    txn.endRelations(workspace)
    txn.dissociateInstances(workspace)
    return { kind: 'done', value: null, changed: true }
  })
}
