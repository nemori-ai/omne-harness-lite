import {
  createAgentModelReceiver,
  createAgentToolReceiver,
  type ToolReceiverDependencies,
  type ToolReceiverState,
  type ModelReceiverDependencies,
  type ModelReceiverState,
} from '@omne-harness/agent'

export { createModelReceiverState } from '@omne-harness/agent'
export { createToolReceiverState } from '@omne-harness/agent'
export type {
  AgentToolReceiver,
  ToolReceiverDependencies,
  ToolReceiverState,
} from '@omne-harness/agent'
export type {
  AgentModelReceiver,
  ModelReceiverDependencies,
  ModelReceiverState,
} from '@omne-harness/agent'

/** The host owns state and the receiver independently of each Agent runtime instance. */
export function createLocalModelReceiver<P>(
  dependencies: ModelReceiverDependencies<P>,
  state: ModelReceiverState<P>,
): ReturnType<typeof createAgentModelReceiver<P>> {
  return createAgentModelReceiver(dependencies, state)
}

/** The same host state survives Agent runtime disposal and receiver reassembly. */
export function createLocalToolReceiver<P>(
  dependencies: ToolReceiverDependencies<P>,
  state: ToolReceiverState<P>,
): ReturnType<typeof createAgentToolReceiver<P>> {
  return createAgentToolReceiver(dependencies, state)
}
