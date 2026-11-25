import { workspaceCodec } from '@omne-harness/legal-identity'
import {
  decide,
  standingOf,
  type InstanceAvailability,
  type InstanceView,
  type ManagementType,
  type NotPermitted,
  type Read,
  type Standing,
  type WorkspaceCatalog,
  type WorkspaceSummary,
  type WorkspaceView,
} from '@omne-harness/workspace-contract'
import { admitted, inspect, NOT_PERMITTED, tenantText, unavailable, workspaceText } from './gate.ts'
import type { WorkspaceDependencies } from './dependencies.ts'
import type { Membership } from './store.ts'
import type { InstanceRecord } from './txn.ts'

function summaryOf(membership: Membership): WorkspaceSummary | null {
  const workspace = workspaceCodec.parse(membership.workspace.workspace)
  const standing: Standing = standingOf(membership.relation)
  if (!workspace.ok || standing === 'none') return null
  return { workspace: workspace.value, type: membership.workspace.type, standing }
}

/** A look at one instance now. A type that is not contributed cannot look. */
async function availability(
  type: ManagementType | null,
  record: InstanceRecord,
): Promise<InstanceAvailability> {
  if (type === null) return { kind: 'unknown', diagnostic: 'type-not-contributed' }
  const inspection = await inspect(type, record.material)
  if ('unavailable' in inspection) return { kind: 'unknown', diagnostic: inspection.unavailable }
  if ('refused' in inspection) return { kind: 'unavailable', reason: inspection.refused }
  return { kind: 'available', directory: inspection.ok.directory, basis: inspection.ok.basis }
}

export function createCatalog<P>(
  deps: Pick<WorkspaceDependencies<P>, 'authority' | 'store' | 'types' | 'node'>,
): WorkspaceCatalog<P> {
  return {
    async list(access): Promise<Read<readonly WorkspaceSummary[]>> {
      const tenant = tenantText(access)
      if (tenant === null) return { kind: 'read', value: [] }
      const blocked = await admitted(deps.authority, access, 'workspace.list', deps.node)
      if (blocked !== null)
        return blocked.kind === 'unavailable' ? blocked : { kind: 'read', value: [] }
      const memberships = await deps.store.memberships(tenant)
      if (memberships.kind === 'unavailable') return unavailable('store')
      const summaries = memberships.value.map(summaryOf)
      if (summaries.includes(null)) return unavailable('stored-value')
      return { kind: 'read', value: summaries as WorkspaceSummary[] }
    },

    async describe(access, input): Promise<Read<WorkspaceView> | NotPermitted> {
      const tenant = tenantText(access)
      const workspace = workspaceText(input)
      if (tenant === null || workspace === null) return NOT_PERMITTED
      const blocked = await admitted(deps.authority, access, 'workspace.view', workspace)
      if (blocked !== null) return blocked
      const state = await deps.store.state(tenant, workspace)
      if (state.kind === 'unavailable') return unavailable('store')
      if (state.value === null) return NOT_PERMITTED
      if (decide(standingOf(state.value.relation), 'view') !== 'allow') return NOT_PERMITTED
      const summary = summaryOf(state.value)
      if (summary === null) return unavailable('stored-value')
      const type = deps.types.named(summary.type)
      const instances: InstanceView[] = []
      for (const record of state.value.instances)
        instances.push({
          instance: record.instance,
          address: record.address,
          availability: await availability(type, record),
        })
      return { kind: 'read', value: { ...summary, instances } }
    },
  }
}
