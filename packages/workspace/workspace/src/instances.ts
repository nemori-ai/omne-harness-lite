import {
  instanceId,
  operationId,
  reason,
  standingOf,
  decide,
  type Answer,
  type InstanceId,
  type Verification,
  type WorkspaceInstances,
} from '@omne-harness/workspace-contract'
import {
  admitted,
  answerOf,
  digestOf,
  inspect,
  NOT_PERMITTED,
  recognise,
  tenantText,
  unavailable,
  workspaceText,
} from './gate.ts'
import type { WorkspaceDependencies } from './dependencies.ts'

const INVALID = { kind: 'not-performed', reason: reason('invalid-request') } as const

/** How often an association is decided again after the workspace changed under it. */
const ATTEMPTS = 3

export function createInstances<P>(deps: WorkspaceDependencies<P>): WorkspaceInstances<P> {
  return {
    async associate(access, input): Promise<Answer<Readonly<{ instance: InstanceId }>>> {
      const tenant = tenantText(access)
      const workspace = workspaceText(input.workspace)
      if (tenant === null || workspace === null) return NOT_PERMITTED
      const operation = operationId(input.operation)
      if (operation === null || typeof input.address !== 'string' || input.address === '')
        return INVALID
      const blocked = await admitted(deps.authority, access, 'workspace.associate', workspace)
      if (blocked !== null) return blocked

      const instance = deps.minting.instance()
      const digest = digestOf({ workspace, address: input.address })
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const membership = await deps.store.membership(tenant, workspace)
        const existing = await deps.store.instances(tenant, workspace)
        if (membership.kind === 'unavailable' || existing.kind === 'unavailable')
          return unavailable('store')
        if (membership.value === null || existing.value === null) return NOT_PERMITTED
        const type = deps.types.named(membership.value.workspace.type)
        if (type === null) return unavailable('type')
        const recognised = await recognise(type, input.address)
        if ('unavailable' in recognised) return unavailable(recognised.unavailable)
        if ('refused' in recognised) return { kind: 'not-performed', reason: recognised.refused }
        const admission = type.admits(
          existing.value.map(record => record.material),
          recognised.ok,
        )
        if (admission.kind === 'refused') return { kind: 'not-performed', reason: admission.reason }

        const committed = await deps.store.associate({
          tenant,
          operation,
          digest,
          workspace,
          instance,
          node: deps.node,
          occupancy: recognised.ok.occupancy,
          address: input.address,
          material: recognised.ok.material,
          revision: membership.value.workspace.revision,
        })
        if (committed.kind === 'committed' && committed.value.kind === 'stale') continue
        return answerOf(committed, operation, value => {
          const made = instanceId(value.instance)
          return made === null ? undefined : { instance: made }
        })
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

      const membership = await deps.store.membership(tenant, workspace)
      const instances = await deps.store.instances(tenant, workspace)
      if (membership.kind === 'unavailable' || instances.kind === 'unavailable')
        return unavailable('store')
      if (membership.value === null || instances.value === null) return NOT_PERMITTED
      if (decide(standingOf(membership.value.relation), 'attach') !== 'allow') return NOT_PERMITTED
      const record = instances.value.find(candidate => candidate.instance === instance)
      if (record === undefined) return NOT_PERMITTED

      const type = deps.types.named(membership.value.workspace.type)
      if (type === null) return unavailable('type')
      const inspection = await inspect(type, record.material)
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
          revision: String(membership.value.workspace.revision),
          digest: digestOf({ tenant, workspace, instance, directory, basis }),
        },
      }
    },
  }
}
