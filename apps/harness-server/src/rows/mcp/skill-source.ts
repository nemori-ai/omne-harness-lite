import type { Plugin } from '@deepseek-ai/cordis'
import type { Access } from '@omne-harness/legal-identity'
import { createMcpSkillSource } from '@omne-harness/mcp-bridge'
import type { ActionDiscovery, EndpointRef, Millis, PeerSkills } from '@omne-harness/mcp-contract'
import { mcpActionDiscoveryKey, mcpPeerSkillsKey } from '@omne-harness/mcp-cordis-contract/cordis'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  skillEntrySourcesKey,
  type SkillEntrySourcesService,
} from '@omne-harness/skill-cordis-contract/cordis'

const UNKNOWN = { kind: 'unknown' } as const

export type McpSkillSourceInput = Readonly<{
  endpoints(access: Access<unknown>): Promise<Outcome<readonly EndpointRef[], 'unknown'>>
  acquireWaitMs: number
  connectBound: Millis
}>

/** The skills MCP peers bring go on `skill.entry-sources` while that point is here; each call reads the MCP services of now. */
export function mcpSkillSourcePlugin(input: McpSkillSourceInput): Plugin.Object {
  return {
    name: 'mcp-skill-source',
    inject: [skillEntrySourcesKey],
    apply(ctx) {
      const discovery = () =>
        ctx.get(mcpActionDiscoveryKey, false) as ActionDiscovery<unknown> | undefined
      const files = () => ctx.get(mcpPeerSkillsKey, false) as PeerSkills<unknown> | undefined
      const source = createMcpSkillSource<unknown>({
        endpoints: input.endpoints,
        discovery: {
          skills: async (...args) => (await discovery()?.skills(...args)) ?? fail(UNKNOWN),
          refresh: async (...args) => (await discovery()?.refresh(...args)) ?? fail(UNKNOWN),
        },
        skills: { read: async (...args) => (await files()?.read(...args)) ?? fail(UNKNOWN) },
        acquireWaitMs: input.acquireWaitMs,
        connectBound: input.connectBound,
      })
      ;(ctx.get(skillEntrySourcesKey) as SkillEntrySourcesService<unknown>).contribute(source)
    },
  }
}
