import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  agentExecutionControlKey,
  agentExecutionRecoveryKey,
  agentInstanceProvisionKey,
  agentInstancesKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import {
  createSessionAgentDrivePlugin,
  type SessionAgentDriveInput,
} from '@omne-harness/session-adapters/cordis'
import type { SessionWorkPrincipals } from '@omne-harness/session-contract'
import {
  sessionAgentDriveKey,
  sessionKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

const INJECTS = [
  agentInstancesKey,
  agentInstanceProvisionKey,
  agentExecutionRecoveryKey,
  agentExecutionControlKey,
  sessionKey,
]

export const sessionAd14Config = z.strictObject({})

export function coordinatorReadPerCall(
  ctx: Context,
): SessionAgentDriveInput<unknown>['coordinator'] {
  return async input => {
    const principals: SessionWorkPrincipals<unknown> | undefined = ctx.get(sessionWorkPrincipalsKey)
    if (principals === undefined)
      return fail({
        kind: 'unavailable',
        owner: sessionWorkPrincipalsKey,
        diagnostic: 'the session work principals have no provider; no coordinator principal',
      })
    return principals.forSession({ actor: 'coordinator', ...input })
  }
}

const plugin: Plugin.Object = {
  name: 'session-ad14',
  inject: INJECTS,
  Config: sessionAd14Config,
  async apply(ctx: Context) {
    await ctx.plugin(
      createSessionAgentDrivePlugin<unknown>({ coordinator: coordinatorReadPerCall(ctx) }),
    )
  },
}

export const sessionAd14Row = defineRow({
  row: 'session-ad14',
  implementation: 'real',
  manifest: { provides: [sessionAgentDriveKey], injects: INJECTS, sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin,
})
