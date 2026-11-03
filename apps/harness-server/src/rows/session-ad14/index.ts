// The `session-ad14` row: the AD-14 `AgentDrivePort` of session-adapters
// (`createSessionAgentDrivePlugin`), which provides `sessionAgentDrive`. It injects the four Agent
// host keys (`agentInstances`, `agentInstanceProvision`, `agentExecutionRecovery`,
// `agentExecutionControl`) and `session` as `coordinator`, as the assembly page lists them; with
// any of them absent the row stays `PENDING`.
//
// Construction input (a runtime object, not configuration): the coordinator principal source. The
// page gives `sessionWorkPrincipals` to this row as a trusted name it reads per call, not as an
// inject. So the source reads the name from the row context at each call and answers with
// `forSession({ actor: 'coordinator', tenant, session })`. When the name has no provider the source
// answers `unavailable` (owner `sessionWorkPrincipals`) and the port calls no Agent entry; the row
// signs no principal of its own.
//
// No configuration: the plugin takes none, and the row's schema refuses any member. No shutdown
// phase: the plugin keeps only execution handles, which it drops when its fiber ends.
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

/**
 * The coordinator principal source over the row context: it reads the trusted
 * `sessionWorkPrincipals` at each call, so an absent provider is an `unavailable` answer of that
 * call and a new provider is used by the next call.
 */
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
