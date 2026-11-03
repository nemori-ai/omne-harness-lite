// The `agent-context` row (B1, R2-D136): `createAgentContextPlugin()` of
// `@omne-harness/agent-context/cordis`, the Context-side Agent adapter. It provides `agentRequests`
// and `agentModelContext` and injects the seven keys of the plugin: the Request Context face, the
// holder parts (K-RQ, row `session-ad04`), the reader eligibility (K-RC, row `session-ad03`), the
// Runtime Context, the Model request preparation and its resources (X-3, both of row
// `model-request-preparation`), and the Agent adoptions, through which the preparation reads the
// `instructions` of the adopted definition as the first sections of the system prompt (R2-D124).
//
// The sixth group (tools, G-TOOLS6): the row hands `catalogToolLookup` (`tools.ts`) to the plugin
// factory. It reads `toolCatalog` and the release consumer again on every call, through the plugin
// context, so the injects stay the seven above; a session without resident tools never reads them.
//
// Configuration (data only, from the operator layer): `owner` (the adoption identity that owns the
// registrations and the evidence), `resultCapacity` (three decimal texts), optional `materials`.
// No measurement observer is handed in here; the C1 collection wires it.
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
import { defineRow } from '../../row.ts'
import { catalogToolLookup } from './tools.ts'

/** What the row hands to the plugin factory: the tool lookup of the sixth group, no observer. */
export const agentContextPluginInput = Object.freeze({ toolLookup: catalogToolLookup })

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
  plugin: createAgentContextPlugin(agentContextPluginInput),
})
