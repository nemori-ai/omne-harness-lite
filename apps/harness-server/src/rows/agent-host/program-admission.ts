import type { Context } from '@deepseek-ai/cordis'
import { decodeActionId, decodeAgentExecutionId } from '@omne-harness/agent-contract'
import { agentNestedActionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { ProgramActionAdmission } from '@omne-harness/tool-contract/provider'
import { ToolProgramAdmissionService } from '@omne-harness/tool-cordis-contract/cordis'
import { AGENT_CONSUMER_OWNER } from '../tool-runtime/access.ts'

const NOT_AN_ACTION =
  'This Code call was not made directly by an Agent action, so nothing can release what its program does.'

/** HS-52: what a program does is judged as an action of the Agent run that the consumer of its Code call names. */
export class ReleaseProgramAdmission extends ToolProgramAdmissionService<unknown> {
  readonly admit: ProgramActionAdmission<unknown>['admit']
  constructor(ctx: Context) {
    super(ctx)
    this.admit = async (input, signal) => {
      const { owner, work, position } = input.request.consumer
      const execution = decodeAgentExecutionId(work)
      const parent = decodeActionId(position)
      if (owner !== AGENT_CONSUMER_OWNER || 'failure' in execution || 'failure' in parent)
        return { kind: 'denied', reason: NOT_AN_ACTION }
      const nested = ctx.get(agentNestedActionsKey, false)
      if (nested === undefined)
        return { kind: 'unanswerable', diagnostic: 'no Agent host answers nested actions now' }
      const { principal, tenant, ordinal, target } = input
      return nested.admit({
        principal,
        tenant,
        execution: execution.ok,
        parent: parent.ok,
        ordinal,
        target,
        signal,
      })
    }
  }
}
