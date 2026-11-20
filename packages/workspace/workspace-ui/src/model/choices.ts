import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type {
  WorkspaceInstanceBody,
  WorkspaceProtocol,
  WorkspaceViewBody,
} from '@omne-harness/workspace-protocol'
import { REFUSED_READS, reasonText } from './words.ts'

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

function noteOf(availability: WorkspaceInstanceBody['availability']): string | null {
  switch (availability.kind) {
    case 'available':
      return null
    case 'unavailable':
      return `用不了：${reasonText(availability.reason)}`
    case 'unknown':
      return '现在不知道能不能用'
  }
}

const choicesOf = (view: WorkspaceViewBody): readonly WorkspaceChoice[] =>
  view.instances.map(instance => ({
    workspace: view.workspace,
    instance: instance.instance,
    label: instance.address,
    selectable: instance.availability.kind === 'available',
    note: noteOf(instance.availability),
  }))

const refusal = (outcome: string) => REFUSED_READS[outcome] ?? outcome
const unavailable = (reason: string) => ({ kind: 'unavailable', reason }) as const

// Each workspace is described to learn its instances; one that cannot be read leaves no list.
export function createWorkspaceChoices(client: Client): WorkspaceChoices {
  return {
    async list(tenant) {
      const owner = readTenantText(tenant)
      if (owner === undefined) return unavailable('租户读不懂')
      try {
        const listed = await client.list({ tenant: owner })
        if (listed.outcome !== 'succeeded') return unavailable(refusal(listed.outcome))
        const choices: WorkspaceChoice[] = []
        for (const { workspace } of listed.body.workspaces) {
          const described = await client.describe({ tenant: owner, workspace })
          if (described.outcome !== 'succeeded') return unavailable(refusal(described.outcome))
          choices.push(...choicesOf(described.body))
        }
        return { kind: 'listed', choices }
      } catch {
        return unavailable('没有送达')
      }
    },
  }
}
