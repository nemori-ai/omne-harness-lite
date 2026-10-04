import type { ContextMutation } from '@omne-harness-lite/runtime-context'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ContextSessionSeed } from './journal-types.ts'
import { decode } from './codec.ts'
import { createContextJournal, projectContext } from './journal.ts'
import { identity, own } from './values.ts'

/** Trusted session creation only. The public Cordis service has no initialization method. */
export function createContextSessionInitializer(log: SessionLog) {
  const journal = createContextJournal(log)
  return {
  async initializeContextSession(scope: SessionScope, input: ContextSessionSeed): Promise<ContextMutation> {
  const seed = decode('Seed', input)
  if (!seed) return { kind: 'rejected', reason: 'invalidInput' }
  const event = decode('Event', { codec: 'runtime-context/1', scope, kind: 'session_initialized', previous: 'absent', revision: identity({ scope, seed }), seed })
  if (!event) return { kind: 'rejected', reason: 'invalidInput' }
  try { projectContext(scope, [{ tenant: scope.tenant, session: scope.session, position: 1, readKeys: [], payload: own(event) }], 1) }
  catch { return { kind: 'rejected', reason: 'invalidInput' } }
  const read = await journal.read(scope)
  if ('unavailable' in read) return { kind: 'rejected', reason: 'unavailable' }
  if (read.state.seed) return identity(read.state.seed) === identity(seed)
    ? { kind: 'applied', revision: event.revision }
    : { kind: 'rejected', reason: 'revisionConflict' }
  const result = await journal.commit(scope, read.state, event)
  return result === 'applied' ? { kind: 'applied', revision: event.revision } : { kind: 'rejected', reason: 'unavailable' }
},
  drain: journal.drain,
  }
}
