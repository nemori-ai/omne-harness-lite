import type { Context } from '@deepseek-ai/cordis'
import { access } from '@omne-harness/legal-identity'
import type { WorkspaceTargetCheck, WorkspaceTargets } from '@omne-harness/session-access'
import {
  instanceId,
  type Verification,
  type WorkspaceInstances,
} from '@omne-harness/workspace-contract'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'

/** Workspace's verification in the words of a session's selection. */
export function targetOf(verification: Verification): WorkspaceTargetCheck {
  switch (verification.kind) {
    case 'attachable': {
      const { directory, attachment, evidence } = verification
      return { kind: 'attachable', directory, attachment, basis: evidence }
    }
    case 'not-permitted':
    case 'instance-unavailable':
      return { kind: 'refused', reason: verification.kind }
    case 'unavailable':
      return { kind: 'unavailable' }
  }
}

export function workspaceTargetsOf(
  instances: Pick<WorkspaceInstances<unknown>, 'verify'> | undefined,
): WorkspaceTargets | undefined {
  if (instances === undefined) return undefined
  return {
    async check({ principal, tenant, workspace, instance }) {
      const named = instanceId(instance)
      if (named === null) return { kind: 'refused', reason: 'not-permitted' }
      return targetOf(
        await instances.verify(access(principal, tenant), { workspace, instance: named }),
      )
    },
  }
}

export function workspaceTargets(ctx: Context): WorkspaceTargets | undefined {
  return workspaceTargetsOf(ctx.get(workspaceInstancesKey))
}
