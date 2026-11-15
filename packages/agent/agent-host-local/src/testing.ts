import { createAgentHostPlugin, type AgentHostPlugin } from './host-plugin.ts'
import type { RuntimeFactory } from './host.ts'

export type AgentHostRuntimeFactory = RuntimeFactory

export function createAgentHostPluginOver(factory: AgentHostRuntimeFactory): AgentHostPlugin {
  return createAgentHostPlugin(factory)
}
