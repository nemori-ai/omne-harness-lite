import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type {
  WorkspaceInstanceBody,
  WorkspaceProtocol,
  WorkspaceViewBody,
} from '@omne-harness/workspace-protocol'
import { availabilityText, readRefusal } from './words.ts'

type Client = Pick<ClientOf<WorkspaceProtocol>, 'list' | 'describe'>

/** One instance a session may stand at: the workspace, the instance, and what a person reads. */
export type WorkspaceChoice = Readonly<{
  workspace: string
  instance: string
  label: string
  selectable: boolean
  note: string | null
}>

export type WorkspaceChoiceListing =
  | Readonly<{ kind: 'listed'; choices: readonly WorkspaceChoice[] }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

/** The instances a tenant can work in, for whoever shows a choice of them. */
export interface WorkspaceChoices {
  list(tenant: string): Promise<WorkspaceChoiceListing>
}

const noteOf = (availability: WorkspaceInstanceBody['availability']): string | null =>
  availability.kind === 'available' ? null : availabilityText(availability)

const choicesOf = (view: WorkspaceViewBody): readonly WorkspaceChoice[] =>
  view.instances.map(instance => ({
    workspace: view.workspace,
    instance: instance.instance,
    label: instance.address,
    selectable: instance.availability.kind === 'available',
    note: noteOf(instance.availability),
  }))

const unavailable = (reason: string) => ({ kind: 'unavailable', reason }) as const

// Each workspace is described to learn its instances; one that cannot be read leaves no list.
export function createWorkspaceChoices(client: Client): WorkspaceChoices {
  return {
    async list(tenant) {
      const owner = readTenantText(tenant)
      if (owner === undefined) return unavailable('租户读不懂')
      try {
        const listed = await client.list({ tenant: owner })
        if (listed.outcome !== 'succeeded') return unavailable(readRefusal(listed.outcome))
        const choices: WorkspaceChoice[] = []
        for (const { workspace } of listed.body.workspaces) {
          const described = await client.describe({ tenant: owner, workspace })
          if (described.outcome !== 'succeeded') return unavailable(readRefusal(described.outcome))
          choices.push(...choicesOf(described.body))
        }
        return { kind: 'listed', choices }
      } catch {
        return unavailable('没有送达')
      }
    },
  }
}
