// The adoption that owns the registrations and the evidence of the `agent-context` row. It is fixed
// by the release code, not by the operator layer: the source registration grant of
// `requestContextTrust` names it, so an operator value could not widen or move that grant (R2-D202).
import type { Adoption } from '@omne-harness/request-context-contract'

export const AGENT_CONTEXT_OWNER: Adoption = Object.freeze({
  owner: '@omne-harness/harness-server/agent-context',
  name: 'agent-context',
  revision: '1',
  digest: 'harness-server:agent-context/1',
})
