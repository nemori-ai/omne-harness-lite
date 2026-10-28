import {
  createAgentModelReceiver,
  type ModelReceiverDependencies,
  type ModelReceiverState,
} from '@omne-harness/agent'

export { createModelReceiverState } from '@omne-harness/agent'
export type {
  AgentModelReceiver,
  ModelReceiverDependencies,
  ModelReceiverState,
} from '@omne-harness/agent'

/** The host owns state and the receiver independently of each Agent runtime instance. */
export function createLocalModelReceiver<P>(
  dependencies: ModelReceiverDependencies<P>,
  state: ModelReceiverState<P>,
) {
  return createAgentModelReceiver(dependencies, state)
}
