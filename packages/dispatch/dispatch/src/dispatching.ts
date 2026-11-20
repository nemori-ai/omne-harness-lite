import type { DispatchReconciling, Dispatching } from '@omne-harness/dispatch-contract'
import { createAccepting } from './accepting.ts'
import { createEnvironment, type DispatchingDependencies } from './answers.ts'
import { createMessaging } from './messaging.ts'
import { createOutcomes } from './outcomes.ts'
import { createReading, createReconciling } from './reading.ts'

/** The registry of dispatches: what agents ask of it, and what the provider drives. */
export function createDispatching(
  deps: DispatchingDependencies,
): Dispatching & DispatchReconciling {
  const env = createEnvironment(deps)
  return {
    ...createAccepting(env),
    ...createOutcomes(env),
    ...createMessaging(env),
    ...createReading(env),
    ...createReconciling(env),
  }
}
