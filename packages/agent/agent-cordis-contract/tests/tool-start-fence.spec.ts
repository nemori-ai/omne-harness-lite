// The Tool start fence that Agent consumes (SPEC "生产者接收面的服务", J03). Agent takes the
// `toolStartFence` key of the Tool Cordis definition: this member must not declare that key or the
// wider `toolStartAuthority`, and its pages must name the key that Tool actually exports.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as cordis from '@omne-harness/agent-cordis-contract/cordis'
import { toolStartAuthorityKey, toolStartFenceKey } from '@omne-harness/tool-cordis-contract/cordis'
import { memberPath } from './module-graph.ts'

const agentKeys = Object.entries(cordis as Record<string, unknown>)
  .filter(([name]) => name.endsWith('Key'))
  .map(([, value]) => value)

describe('the Tool start fence', () => {
  it('is not declared again by Agent, and neither is the start authority', () => {
    expect(agentKeys).not.toContain(toolStartFenceKey)
    expect(agentKeys).not.toContain(toolStartAuthorityKey)
  })

  it('is named on the SPEC and the Cordis page by the key that Tool exports', () => {
    for (const page of ['SPEC.md', 'docs/cordis.md']) {
      expect(readFileSync(memberPath(page), 'utf8')).toContain(`\`${toolStartFenceKey}\``)
    }
  })
})
