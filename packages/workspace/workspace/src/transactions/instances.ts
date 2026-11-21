import {
  decide,
  reason,
  standingOf,
  type GovernedOperation,
  type InstanceId,
  type Json,
} from '@omne-harness/workspace-contract'
import type { WorkspaceRecord, WorkspaceTxn } from '../txn.ts'
import { once, type Named, type ScriptResult, type Stale } from './script.ts'

export type AssociateCommand = Named &
  Readonly<{
    workspace: string
    instance: InstanceId
    node: string
    occupancy: string
    address: string
    material: Json
    /** The workspace revision the type's admission was decided at. */
    revision: number
  }>
export type AssociateResult = ScriptResult<Readonly<{ instance: InstanceId }>> | Stale

export type DissociateCommand = Named & Readonly<{ workspace: string; instance: InstanceId }>
export type DissociateResult = ScriptResult<null>

/** The workspace, when this tenant may do this to it now. A missing workspace and no relation look the same. */
function governed(
  txn: WorkspaceTxn,
  workspace: string,
  tenant: string,
  operation: GovernedOperation,
): WorkspaceRecord | null {
  const standing = standingOf(txn.relation(workspace, tenant))
  return decide(standing, operation) === 'allow' ? txn.workspace(workspace) : null
}

/** One more instance of a workspace. The type admitted it against the instances at `revision`. */
export function associateInstance(txn: WorkspaceTxn, command: AssociateCommand): AssociateResult {
  return once(txn, command, 'associate', () => {
    const { workspace, instance, node, occupancy, address, material } = command
    const record = governed(txn, workspace, command.tenant, 'associate')
    if (record === null) return { kind: 'not-permitted' }
    if (record.revision !== command.revision) return { kind: 'stale' }
    if (txn.occupant(node, occupancy) !== null)
      return { kind: 'not-performed', reason: reason('occupied') }
    txn.insertInstance({ instance, workspace, node, occupancy, address, material, state: 'active' })
    txn.setRevision(workspace, record.revision + 1)
    return { kind: 'done', value: { instance }, changed: true }
  })
}

/** Ends an association. An instance of another workspace answers the same as no permission. */
export function dissociateInstance(
  txn: WorkspaceTxn,
  command: DissociateCommand,
): DissociateResult {
  return once(txn, command, 'dissociate', () => {
    const record = governed(txn, command.workspace, command.tenant, 'dissociate')
    if (record === null) return { kind: 'not-permitted' }
    const instance = txn.instance(command.instance)
    if (instance === null || instance.workspace !== command.workspace)
      return { kind: 'not-permitted' }
    if (instance.state === 'dissociated') return { kind: 'done', value: null, changed: false }
    txn.setInstanceState(command.instance, 'dissociated')
    txn.setRevision(command.workspace, record.revision + 1)
    return { kind: 'done', value: null, changed: true }
  })
}
