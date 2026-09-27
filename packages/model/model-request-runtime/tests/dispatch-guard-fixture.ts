import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import type { DispatchGuardInput } from '@omne-harness-lite/model-request-runtime'

export const profile: ModelProfileSnapshot = {
  adaptation: {
    implementation: { name: 'teaching', revision: 'one' },
    definition: { modelId: 'teaching/model', revision: 'one' },
    configuration: { revision: 'one', values: { precise: new LosslessNumber('9007199254740993') } },
  },
  providers: ['first', 'second'],
  allowFallback: true,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: new LosslessNumber('9007199254740993'),
  maxOutputTokens: 10,
  updatedAt: '2026-09-27T00:00:00Z',
}

export function guardInput(overrides: Partial<DispatchGuardInput> = {}): DispatchGuardInput {
  return {
    session: 'session',
    callId: 'call',
    call: { known: { session: 'session', callId: 'call', phase: { known: 'awaiting_decision' } } },
    dispatches: { known: { session: 'session', callId: 'call', opened: [{ known: false }] } },
    latestFailure: { known: 'upstream_unavailable' },
    snapshot: { known: profile },
    plan: { provider: 'second' },
    ...overrides,
  }
}
