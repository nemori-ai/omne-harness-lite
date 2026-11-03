// The testing entry of the local Agent host: the `agent-host` plugin over a runtime factory that the
// caller gives. Production uses `agentHostPlugin` or `createAgentHostLocalPlugin` of `./cordis`,
// whose factory is `createAgentRuntime`. A test wraps that factory here, for example to script a
// runtime answer that the host must handle (an `unresolved` or hanging quiesce), and so proves the
// host side only. Production code does not import this entry.
import { createAgentHostPlugin, type AgentHostPlugin } from './host-plugin.ts'
import type { RuntimeFactory } from './host.ts'

/** The factory the host calls for each instance: `createAgentRuntime` in production. */
export type AgentHostRuntimeFactory = RuntimeFactory

/** The `agent-host` plugin over `factory`: same name, `inject`, configuration and ordered stop. */
export function createAgentHostPluginOver(factory: AgentHostRuntimeFactory): AgentHostPlugin {
  return createAgentHostPlugin(factory)
}
