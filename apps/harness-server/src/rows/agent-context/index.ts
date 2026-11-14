import {
  agentAdoptionsKey,
  agentModelContextKey,
  agentRequestsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  createAgentContextPlugin,
  MODEL_PREPARATION_RESOURCES,
} from '@omne-harness/agent-context/cordis'
import { modelRequestPreparationKey } from '@omne-harness/model-cordis-contract/cordis'
import {
  contextHolderSourcesKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { AGENT_CONTEXT_OWNER } from '../../assembly/agent-context-owner.ts'
import { defineRow } from '../../row.ts'
import { catalogToolLookup } from './tools.ts'

export const agentContextPluginInput = Object.freeze({ toolLookup: catalogToolLookup })

const Assembled = createAgentContextPlugin(agentContextPluginInput)
type MemberConfig = typeof Assembled.Config

export const agentContextRowConfig: MemberConfig = {
  '~standard': {
    ...Assembled.Config['~standard'],
    validate: (value: unknown) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if ('owner' in value)
          return {
            issues: [
              {
                message:
                  'owner is fixed by the release code (R2-D202); the configuration does not give it',
              },
            ],
          }
        return Assembled.Config['~standard'].validate({ ...value, owner: AGENT_CONTEXT_OWNER })
      }
      return Assembled.Config['~standard'].validate(value)
    },
  },
}

class AgentContextRowPlugin extends Assembled {
  static override readonly Config = agentContextRowConfig
}

export const agentContextRow = defineRow({
  row: 'agent-context',
  implementation: 'real',
  manifest: {
    provides: [agentRequestsKey, agentModelContextKey],
    injects: [
      requestContextKey,
      contextHolderSourcesKey,
      runtimeContextReaderEligibilityKey,
      runtimeContextKey,
      modelRequestPreparationKey,
      MODEL_PREPARATION_RESOURCES,
      agentAdoptionsKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: AgentContextRowPlugin,
})
