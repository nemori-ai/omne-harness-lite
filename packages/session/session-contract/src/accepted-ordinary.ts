import { encodeEntry } from './entries.ts'
import type { AdmittedSource } from './input-sources.ts'
import type { RunId } from './identity.ts'
import type { EncodedEntry } from './judgments.ts'
import type { RoutedInput } from './values.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

/** What accepting an ordinary input writes: the message as the person sent it, then where it goes. */
export function acceptedOrdinary(
  input: Ordinary,
  destination: 'current-run' | 'next-run',
  run: RunId | null,
  source: AdmittedSource,
): EncodedEntry[] {
  return [
    encodeEntry(
      {
        kind: `message.${input.message.role}`,
        message: input.message,
        source: input.origin,
        admission: null,
        consumption: null,
        participation: null,
      },
      { owner: 'user', via: 'intake', source: input.origin },
    ),
    encodeEntry(
      {
        kind: 'intake.routed',
        input: input.input,
        destination,
        run,
        origin: input.origin,
        source,
        ...(input.afterRun === true && run !== null ? { after: true as const } : {}),
      },
      { owner: 'session', via: 'intake', source: input.origin },
    ),
  ]
}
