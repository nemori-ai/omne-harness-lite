// The Tool start fence that Agent consumes. Agent takes the `toolStartFence` key of the Tool Cordis
// definition: this member must not declare that key or the wider `toolStartAuthority`.
import { describe, expect, it } from 'vitest'
import * as cordis from '@omne-harness/agent-cordis-contract/cordis'
import { toolStartAuthorityKey, toolStartFenceKey } from '@omne-harness/tool-cordis-contract/cordis'

const agentKeys = Object.entries(cordis as Record<string, unknown>)
  .filter(([name]) => name.endsWith('Key'))
  .map(([, value]) => value)

describe('the Tool start fence', () => {
  it('is not declared again by Agent, and neither is the start authority', () => {
    expect(agentKeys).not.toContain(toolStartFenceKey)
    expect(agentKeys).not.toContain(toolStartAuthorityKey)
  })
})
