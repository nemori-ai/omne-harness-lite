import { workspaceCodec, type Access } from '@omne-harness/legal-identity'
import {
  instanceId,
  operationId,
  reason,
  typeName,
  type Answer,
  type ManagementType,
  type OperationId,
  type OperationView,
  type Recognised,
  type RegisteredWorkspace,
  type RelationInput,
  type RelationOperation,
  type TypeName,
  type WorkspaceGovernance,
} from '@omne-harness/workspace-contract'
import {
  admitted,
  answerOf,
  digestOf,
  isAddress,
  knownTenant,
  NOT_PERMITTED,
  recognise,
  tenantText,
  textOfTenant,
  unavailable,
  workspaceText,
} from './gate.ts'
import type { WorkspaceDependencies } from './dependencies.ts'
import type { TypeLookup } from './types.ts'

const INVALID = { kind: 'not-performed', reason: reason('invalid-request') } as const
const TYPE_UNKNOWN = { kind: 'not-performed', reason: reason('type-unknown') } as const

/** No type named is null. A name that is not a type name is undefined. */
const namedType = (name: TypeName | undefined): TypeName | null | undefined =>
  name === undefined ? null : (typeName(name) ?? undefined)

type Taken =
  | Readonly<{ kind: 'taken'; type: ManagementType; recognised: Recognised }>
  | Extract<Answer<never>, { kind: 'not-performed' | 'unavailable' }>

/** Finds the type that takes an address. */
async function take(types: TypeLookup, address: string, named: TypeName | null): Promise<Taken> {
  const candidates = named === null ? types.specificFirst() : [types.named(named)]
  let refusal: Taken = TYPE_UNKNOWN
  for (const type of candidates) {
    if (type === null) return TYPE_UNKNOWN
    const answer = await recognise(type, address)
    if ('ok' in answer) return { kind: 'taken', type, recognised: answer.ok }
    if ('unavailable' in answer) return unavailable(answer.unavailable)
    refusal = { kind: 'not-performed', reason: answer.refused }
  }
  return refusal
}

type Ending = Omit<RelationInput, 'target'>

export function createGovernance<P>(deps: WorkspaceDependencies<P>): WorkspaceGovernance<P> {
  /** One change to one relation. Without a target it is the caller's own. */
  async function relation(
    access: Access<P>,
    input: Ending & Partial<RelationInput>,
    change: RelationOperation,
  ): Promise<Answer<null>> {
    const tenant = tenantText(access)
    const workspace = workspaceText(input.workspace)
    const target = input.target === undefined ? tenant : textOfTenant(input.target)
    if (tenant === null || workspace === null || target === null) return NOT_PERMITTED
    const operation = operationId(input.operation)
    if (operation === null) return INVALID
    const blocked = await admitted(deps.authority, access, `workspace.${change}`, workspace)
    if (blocked !== null) return blocked
    if (change === 'grant-participation' && input.target !== undefined) {
      const unknown = await knownTenant(deps.authority, input.target)
      if (unknown !== null) return unknown
    }
    const digest = digestOf({ workspace, change, target })
    const command = { tenant, operation, digest, workspace, change, target }
    return answerOf(await deps.store.govern(command), operation, () => null)
  }

  return {
    grantParticipation: (access, input) => relation(access, input, 'grant-participation'),
    grantAdmin: (access, input) => relation(access, input, 'grant-admin'),
    revokeAdmin: (access, input) => relation(access, input, 'revoke-admin'),
    remove: (access, input) => relation(access, input, 'remove'),
    leave: (access, { operation, workspace }) =>
      relation(access, { operation, workspace }, 'leave'),

    async destroy(access, input): Promise<Answer<null>> {
      const tenant = tenantText(access)
      const workspace = workspaceText(input.workspace)
      if (tenant === null || workspace === null) return NOT_PERMITTED
      const operation = operationId(input.operation)
      if (operation === null) return INVALID
      const blocked = await admitted(deps.authority, access, 'workspace.destroy', workspace)
      if (blocked !== null) return blocked
      const command = { tenant, operation, digest: digestOf({ workspace }), workspace }
      return answerOf(await deps.store.destroy(command), operation, () => null)
    },

    async register(access, input): Promise<Answer<RegisteredWorkspace>> {
      const tenant = tenantText(access)
      if (tenant === null) return NOT_PERMITTED
      const operation = operationId(input.operation)
      const named = namedType(input.type)
      if (operation === null || !isAddress(input.address) || named === undefined) return INVALID
      const blocked = await admitted(deps.authority, access, 'workspace.register', deps.node)
      if (blocked !== null) return blocked

      const taken = await take(deps.types, input.address, named)
      if (taken.kind !== 'taken') return taken
      const workspace = workspaceText(deps.minting.workspace())
      if (workspace === null) return unavailable('minting')
      const committed = await deps.store.register({
        tenant,
        operation,
        digest: digestOf({ address: input.address, type: named }),
        workspace,
        instance: deps.minting.instance(),
        type: taken.type.name,
        node: deps.node,
        occupancy: taken.recognised.occupancy,
        address: input.address,
        material: taken.recognised.material,
      })
      return answerOf(committed, operation, stored)
    },

    async operation(access, input): Promise<OperationView> {
      const tenant = tenantText(access)
      const operation: OperationId | null = operationId(input)
      if (tenant === null || operation === null) return NOT_PERMITTED
      const blocked = await admitted(deps.authority, access, 'workspace.recall', deps.node)
      if (blocked !== null) return blocked
      const recorded = await deps.store.operation(tenant, operation)
      if (recorded.kind === 'unavailable') return unavailable('store')
      if (recorded.value === null) return { kind: 'not-recorded' }
      return { kind: 'recorded', operation: recorded.value.kind, value: recorded.value.value }
    },
  }
}

function stored(
  value: Readonly<{ workspace: string; instance: string; type: string }>,
): RegisteredWorkspace | undefined {
  const workspace = workspaceCodec.parse(value.workspace)
  const instance = instanceId(value.instance)
  const type = typeName(value.type)
  if (!workspace.ok || instance === null || type === null) return undefined
  return { workspace: workspace.value, instance, type }
}
