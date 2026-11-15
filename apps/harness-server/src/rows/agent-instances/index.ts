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
