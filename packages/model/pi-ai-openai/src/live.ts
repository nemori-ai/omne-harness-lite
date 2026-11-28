import type { Adoption, ModelProfileDefinition } from '@omne-harness/model-contract'
import type { PiFamily, PiLiveBinding } from '@omne-harness/pi-ai-transport'
import {
  defineLiveFamily,
  officialLiveProfilesOf,
  type LiveRecord,
} from '@omne-harness/pi-ai-transport/family-kit'

export const OPENAI_LIVE_OWNER = '@omne-harness/pi-ai-openai/live'

/** The live models OpenAI serves itself, on its live sessions interface. */
export const OPENAI_LIVE_RECORDS: readonly LiveRecord[] = [
  {
    name: 'gpt-live-1.1',
    revision: '1',
    route: { provider: 'openai', model: 'gpt-live-1.1' },
    status: 'current',
    live: { voices: ['marin'], audioFormats: ['pcm16'], maxSessionSeconds: null },
    profile: {
      input: ['voice', 'text'],
      output: ['voice', 'text'],
      evidence:
        'OpenAI live sessions over a socket, measured 2026-11-26 in four sessions: session.start with raw 16-bit PCM at 24 kHz and the voice marin answered session.started in 1.1 to 1.3 s; the caller was sent as appended audio, and thinking, commentary and instructions appends were each answered as appended or as an error naming the command; the session spoke and sent transcripts of both sides; session.closed carried the usage in seconds. expires_at was about two hours after the start; the upstream gives it per session, so no maximum is recorded. Other voices and audio formats are not measured.',
    },
  },
]

export function createOpenAiLiveFamily(): PiFamily<PiLiveBinding> {
  return defineLiveFamily({
    owner: OPENAI_LIVE_OWNER,
    endpoint: 'live-sessions',
    records: OPENAI_LIVE_RECORDS,
  })
}

export function officialOpenAiLiveProfiles(
  input: Readonly<{ retryPolicy: Adoption }>,
): readonly ModelProfileDefinition<'live'>[] {
  return officialLiveProfilesOf(OPENAI_LIVE_OWNER, OPENAI_LIVE_RECORDS, input)
}
