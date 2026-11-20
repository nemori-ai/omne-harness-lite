import { reason, type InstanceId, type Json, type TypeName } from '@omne-harness/workspace-contract'
import type { WorkspaceTxn } from '../txn.ts'
import { once, type Named, type ScriptResult } from './script.ts'

export type RegisterCommand = Named &
  Readonly<{
    workspace: string
    instance: InstanceId
    type: TypeName
    node: string
    occupancy: string
    address: string
    material: Json
  }>

export type RegisterResult = ScriptResult<
  Readonly<{ workspace: string; instance: InstanceId; type: TypeName }>
>

/** One commit: the workspace, its owner's relation and its first instance, or nothing. */
export function registerWorkspace(txn: WorkspaceTxn, command: RegisterCommand): RegisterResult {
  return once(txn, command, 'register', () => {
    const { workspace, instance, type, node, occupancy, address, material, tenant } = command
    if (txn.occupant(node, occupancy) !== null)
      return { kind: 'not-performed', reason: reason('occupied') }
    txn.insertWorkspace({ workspace, type, revision: 1 })
    txn.putRelation(workspace, tenant, { role: 'owner' })
    txn.insertInstance({ instance, workspace, node, occupancy, address, material, state: 'active' })
    return { kind: 'done', value: { workspace, instance, type }, changed: true }
  })
}
