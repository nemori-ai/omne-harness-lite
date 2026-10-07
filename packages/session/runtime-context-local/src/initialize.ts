import { decodeContextData } from '@omne-harness-lite/runtime-context'
import type { ContextMutation } from '@omne-harness-lite/runtime-context'
import { checkedScope } from './scope.ts'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ContextSessionSeed } from '@omne-harness-lite/runtime-context'
import { decodeEvent } from './codec.ts'
import { createContextJournal, projectContext } from './journal.ts'
import { identity, own } from './values.ts'

function prepareInitialization(
  inputScope: SessionScope,
  input: ContextSessionSeed,
):
  | { readonly kind: 'rejected'; readonly reason: 'invalidInput' }
  | {
      readonly scope: SessionScope
      readonly seed: ContextSessionSeed
      readonly event: import('./journal-types.ts').ContextEvent
    } {
  const scope = checkedScope(inputScope)
  if (!scope) return { kind: 'rejected', reason: 'invalidInput' } as const
  const seed = decodeContextData('Seed', input)
  if (!seed) return { kind: 'rejected', reason: 'invalidInput' } as const
  const event = decodeEvent({
    codec: 'runtime-context/1',
    scope,
    kind: 'session_initialized',
    previous: 'absent',
    revision: identity({ scope, seed }),
    seed,
  })
  if (!event) return { kind: 'rejected', reason: 'invalidInput' } as const
  try {
    projectContext(
      scope,
      [
        {
          tenant: scope.tenant,
          session: scope.session,
          position: 1,
          readKeys: ['runtime-context'],
          dedupeKey: `context:${event.revision}`,
          payload: own(event),
        },
      ],
      1,
    )
  } catch {
    return { kind: 'rejected', reason: 'invalidInput' } as const
  }
  return { scope, seed, event }
}

/** Trusted session creation only. The public Cordis service has no initialization method. */
export function createContextInitializer(
  journal: ReturnType<typeof createContextJournal>,
  active: () => boolean,
  notify: () => void,
) {
  return {
    async initializeContextSession(
      inputScope: SessionScope,
      input: ContextSessionSeed,
    ): Promise<ContextMutation> {
      if (!active()) return { kind: 'rejected', reason: 'ownerStopped' }
      const prepared = prepareInitialization(inputScope, input)
      if ('kind' in prepared) return prepared
      const { scope, seed, event } = prepared
      const read = await journal.read(scope)
      if ('unavailable' in read) return { kind: 'rejected', reason: 'unavailable' }
      if (read.state.seed)
        return identity(read.state.seed) === identity(seed)
          ? { kind: 'applied', revision: read.state.initializationRevision }
          : { kind: 'rejected', reason: 'revisionConflict' }
      if (!active()) return { kind: 'rejected', reason: 'ownerStopped' }
      const result = await journal.commit(scope, read.state, event)
      if (result === 'applied') notify()
      return result === 'applied'
        ? { kind: 'applied', revision: event.revision }
        : { kind: 'rejected', reason: 'unavailable' }
    },
    drain: journal.drain,
  }
}
