import { attemptStartedPayload, type AttemptStartedFact } from '@omne-harness-lite/session-runtime'
import { checkAppendInput, type OwnedLogEntry } from '@omne-harness-lite/session-log'
import type { ModelLogShell } from '@omne-harness-lite/model-request-runtime'
/** Actual Session-owned attempt fact. This fixture cannot construct a model reminder. */
export function prepareAttemptFact(input: {
  readonly session: string
  readonly shell: ModelLogShell
  readonly key: string
  readonly reason: AttemptStartedFact['reason']
  readonly at: string
}): { readonly ok: OwnedLogEntry } {
  if (input.shell.run === undefined || input.shell.attempt === undefined)
    throw new Error('attempt fixture requires its original Run and attempt')
  const checked = checkAppendInput(
    input.session,
    [
      {
        ...input.shell,
        dedupeKey: input.key,
        readKeys: ['session-runtime/attempts'],
        payload: attemptStartedPayload({
          kind: 'attempt_started',
          run: input.shell.run,
          attempt: input.shell.attempt,
          reason: input.reason,
          at: input.at,
        }),
      },
    ],
    { kind: 'fenced', run: input.shell.run, attempt: input.shell.attempt },
    { kind: 'unconditional' },
  )
  if ('failure' in checked || checked.ok.entries[0] === undefined)
    throw new Error('invalid attempt fact fixture')
  return { ok: checked.ok.entries[0] }
}
