// The `agent-host` row: the local Agent host. The plugin is `agentHostPlugin` of
// `@omne-harness/agent-host-local/cordis`; the row body runs it in the row fiber, so its five faces
// (`agentInstanceHost` as well as the four the page lists) appear and end with the row. The row
// declares the fourteen injects of the assembly page. The plugin's own `inject` array holds eleven of
// them; `agentJournalEntries`, `agentMaterials` and `agentAccountOutlet` are the receiving keys that
// the page lists and the member does not inject yet, so the row keeps them as row injects and the
// host stays `PENDING` until they have providers.
//
// Phase `business`, carried by the row body. The member has no ordered stop yet: it exposes no
// quiesce-all entry and does not inject `assemblyLifecycle`, and instances are released only when the
// fiber unloads. The handle therefore answers `incomplete` with that reason. It never answers
// `settled`, so the shutdown report stays honest until the member offers the entry.
//
// Configuration (data only, no default, the release gives every item): `jointCommits`,
// `instanceIdleMs` and the rest of the Agent factory configuration; a wrong value fails the load.
import { agentHostPlugin } from '@omne-harness/agent-host-local/cordis'
import {
  agentAccessCheckKey,
  agentAdoptionsKey,
  agentClockKey,
  agentConditionsKey,
  agentExecutionControlKey,
  agentExecutionRecoveryKey,
  agentInstanceProvisionKey,
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentMessageHandoffKey,
  agentModelContextKey,
  agentModelSelectionKey,
  agentPublicationAuthorityKey,
  agentRequestsKey,
  agentAccountOutletKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { defineRow, type RowBody } from '../../row.ts'

/** The host maintenance principal: a root object of the assembly entry with no service definition. */
const AGENT_HOST_PRINCIPAL = 'agentHostPrincipal'

const body: RowBody = async (ctx, config) => {
  await agentHostPlugin.apply(ctx, config as Parameters<typeof agentHostPlugin.apply>[1])
  return {
    stop: () =>
      Promise.resolve({
        kind: 'incomplete',
        detail:
          'agent-host-local has no ordered stop: instances are released when the host fiber unloads',
      }),
  }
}

export const agentHostRow = defineRow({
  row: 'agent-host',
  implementation: 'real',
  manifest: {
    provides: [
      agentPublicationAuthorityKey,
      agentExecutionRecoveryKey,
      agentExecutionControlKey,
      agentInstanceProvisionKey,
    ],
    injects: [
      agentJournalKey,
      agentJournalEntriesKey,
      agentMaterialsKey,
      agentAccessCheckKey,
      agentAdoptionsKey,
      agentConditionsKey,
      agentRequestsKey,
      agentModelSelectionKey,
      agentModelContextKey,
      agentMessageHandoffKey,
      agentAccountOutletKey,
      modelRuntimeKey,
      agentClockKey,
      AGENT_HOST_PRINCIPAL,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'business' },
  Config: agentHostPlugin.Config,
  body,
})
