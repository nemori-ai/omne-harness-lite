import {
  createLocalSessionContext,
  type SessionContextOptions,
} from '@omne-harness-lite/session-runtime-local/cordis'
import { createRuntimeContextLocal } from '@omne-harness-lite/runtime-context-local/cordis'

/** Application selection for one independent Session. Each call owns a fresh provider generation. */
export function createSessionContext(options: Omit<SessionContextOptions, 'runtimeContext'>) {
  return createLocalSessionContext({ ...options, runtimeContext: createRuntimeContextLocal() })
}
