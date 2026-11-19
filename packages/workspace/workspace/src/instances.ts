import { workspaceCodec } from '@omne-harness/legal-identity'
import {
  decide,
  instanceId,
  operationId,
  reason,
  standingOf,
  type Answer,
  type InstanceId,
  type Located,
  type ManagementType,
  type Reason,
  type Recognised,
  type Verification,
  type WorkspaceInstances,
} from '@omne-harness/workspace-contract'
import type { WorkspaceDependencies } from './dependencies.ts'
import {
  admitted,
  answerOf,
  decided,
  digestOf,
  inspect,
  isAddress,
  NOT_PERMITTED,
  recognise,
  tenantText,
  unavailable,
  uncommitted,
  workspaceText,
  type Blocked,
} from './gate.ts'
import type { WorkspaceState } from './store.ts'
import type { InstanceRecord } from './txn.ts'

const INVALID = { kind: 'not-performed', reason: reason('invalid-request') } as const
const NOWHERE = { kind: 'none' } as const
const notPerformed = (why: Reason) => ({ kind: 'not-performed', reason: why }) as const

/** How often an association is decided again after the workspace changed under it. */
const ATTEMPTS = 3

type Stores<P> = Pick<WorkspaceDependencies<P>, 'store' | 'types'>
type Governed = Readonly<{ kind: 'governed'; state: WorkspaceState; type: ManagementType }>

/** The workspace as this tenant sees it now, with its type. A type that is not contributed cannot answer. */
async function governed<P>(
  deps: Stores<P>,
  tenant: string,
  workspace: string,
): Promise<Governed | Blocked> {
  const state = await deps.store.state(tenant, workspace)
  if (state.kind === 'unavailable') return unavailable('store')
  if (state.value === null) return NOT_PERMITTED
  const type = deps.types.named(state.value.workspace.type)
  return type === null
    ? unavailable('type-not-contributed')
    : { kind: 'governed', state: state.value, type }
}

type Admitted = Readonly<{ kind: 'admitted'; recognised: Recognised; revision: number }>

/** Whether the workspace's type takes this address as one more instance, decided on the facts read now. */
async function admission<P>(
  deps: Stores<P>,
  tenant: string,
  workspace: string,
  address: string,
): Promise<
  Admitted | Extract<Answer<never>, { kind: 'not-permitted' | 'not-performed' | 'unavailable' }>
> {
  const found = await governed(deps, tenant, workspace)
  if (found.kind !== 'governed') return found
  const recognised = await recognise(found.type, address)
  if ('unavailable' in recognised) return unavailable(recognised.unavailable)
  if ('refused' in recognised) return notPerformed(recognised.refused)
  const materials = found.state.instances.map(record => record.material)
  const answer = found.type.admits(materials, recognised.ok)
  if (answer.kind === 'refused') return notPerformed(answer.reason)
  return { kind: 'admitted', recognised: recognised.ok, revision: found.state.workspace.revision }
}

/** The stored result of an association, read back. */
function associated(value: Readonly<{ instance: string }>): { instance: InstanceId } | undefined {
  const instance = instanceId(value.instance)
  return instance === null ? undefined : { instance }
}

/** The instance registered at this address on this node, among those of one workspace. */
function instanceAt(
  instances: readonly InstanceRecord[],
  node: string,
  address: string,
): Located | undefined {
  const record = instances.find(each => each.node === node && each.address === address)
  if (record === undefined) return undefined
  const workspace = workspaceCodec.parse(record.workspace)
  return workspace.ok
    ? { kind: 'located', workspace: workspace.value, instance: record.instance }
    : unavailable('stored-value')
}

export function createInstances<P>(deps: WorkspaceDependencies<P>): WorkspaceInstances<P> {
  return {
    async associate(access, input): Promise<Answer<Readonly<{ instance: InstanceId }>>> {
      const tenant = tenantText(access)
      const workspace = workspaceText(input.workspace)
      if (tenant === null || workspace === null) return NOT_PERMITTED
      const operation = operationId(input.operation)
      if (operation === null || !isAddress(input.address)) return INVALID
      const blocked = await admitted(deps.authority, access, 'workspace.associate', workspace)
      if (blocked !== null) return blocked

      const instance = deps.minting.instance()
      const digest = digestOf({ workspace, address: input.address })
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const found = await admission(deps, tenant, workspace, input.address)
        if (found.kind !== 'admitted') return found
        const committed = await deps.store.associate({
          tenant,
          operation,
          digest,
          workspace,
          instance,
          node: deps.node,
          occupancy: found.recognised.occupancy,
          address: input.address,
          material: found.recognised.material,
          revision: found.revision,
        })
        if (committed.kind !== 'committed') return uncommitted(committed, operation)
        if (committed.value.kind === 'stale') continue
        return decided(committed.value, associated)
      }
      return unavailable('contended')
    },

    async dissociate(access, input): Promise<Answer<null>> {
      const tenant = tenantText(access)
      const workspace = workspaceText(input.workspace)
      const instance = instanceId(input.instance)
      if (tenant === null || workspace === null || instance === null) return NOT_PERMITTED
      const operation = operationId(input.operation)
      if (operation === null) return INVALID
      const blocked = await admitted(deps.authority, access, 'workspace.dissociate', workspace)
      if (blocked !== null) return blocked
      const committed = await deps.store.dissociate({
        tenant,
        operation,
        digest: digestOf({ workspace, instance }),
        workspace,
        instance,
      })
      return answerOf(committed, operation, () => null)
    },

    async verify(access, input): Promise<Verification> {
      const tenant = tenantText(access)
      const workspace = workspaceText(input.workspace)
      const instance = instanceId(input.instance)
      if (tenant === null || workspace === null || instance === null) return NOT_PERMITTED
      const blocked = await admitted(deps.authority, access, 'workspace.attach', workspace)
      if (blocked !== null) return blocked

      const found = await governed(deps, tenant, workspace)
      if (found.kind !== 'governed') return found
      if (decide(standingOf(found.state.relation), 'attach') !== 'allow') return NOT_PERMITTED
      const record = found.state.instances.find(candidate => candidate.instance === instance)
      if (record === undefined) return NOT_PERMITTED

      const inspection = await inspect(found.type, record.material)
      if ('unavailable' in inspection) return unavailable(inspection.unavailable)
      if ('refused' in inspection)
        return { kind: 'instance-unavailable', reason: inspection.refused }
      const { directory, basis } = inspection.ok
      return {
        kind: 'attachable',
        directory,
        attachment: { instance, basis },
        evidence: {
          owner: 'workspace',
          record: `${workspace}/${instance}`,
          revision: String(found.state.workspace.revision),
          digest: digestOf({ tenant, workspace, instance, directory, basis }),
        },
      }
    },

    async locate(access, address): Promise<Located> {
      const tenant = tenantText(access)
      if (tenant === null) return NOWHERE
      const blocked = await admitted(deps.authority, access, 'workspace.list', deps.node)
      if (blocked !== null) return blocked.kind === 'unavailable' ? blocked : NOWHERE
      const memberships = await deps.store.memberships(tenant)
      if (memberships.kind === 'unavailable') return unavailable('store')
      for (const { workspace } of memberships.value) {
        const state = await deps.store.state(tenant, workspace.workspace)
        if (state.kind === 'unavailable') return unavailable('store')
        const found = instanceAt(state.value?.instances ?? [], deps.node, address)
        if (found !== undefined) return found
      }
      return NOWHERE
    },
  }
}
