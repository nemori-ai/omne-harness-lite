// The `agent-instances` row: the Agent instance directory. The plugin is `agentInstancesPlugin` of
// `@omne-harness/agent-cordis-contract/cordis`. It injects `agentPublicationAuthority` and
// `agentAccessCheck` and provides `agentInstances`. It has no configuration (its `Config` refuses
// any member) and no shutdown phase. With either inject absent the row stays `PENDING`.
import {
  agentAccessCheckKey,
  agentInstancesKey,
  agentInstancesPlugin,
  agentPublicationAuthorityKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const agentInstancesRow = defineRow({
  row: 'agent-instances',
  implementation: 'real',
  manifest: {
    provides: [agentInstancesKey],
    injects: [agentPublicationAuthorityKey, agentAccessCheckKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: agentInstancesPlugin,
})
