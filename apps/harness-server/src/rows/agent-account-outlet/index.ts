import { AgentAccountOutletProvider } from '@omne-harness/agent-context/cordis'
import { agentAccountOutletKey } from '@omne-harness/agent-cordis-contract/cordis'
import {
  contextAccountingInboxKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const agentAccountOutletRow = defineRow({
  row: 'agent-account-outlet',
  implementation: 'real',
  manifest: {
    provides: [agentAccountOutletKey],
    injects: [requestContextKey, contextAccountingInboxKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: AgentAccountOutletProvider,
})
