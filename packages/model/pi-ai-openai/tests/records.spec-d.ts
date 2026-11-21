import type { FactSource, RecordFact } from '@omne-harness/pi-ai-transport'
import { OPENAI_RECORDS, type OpenAiResponsesRecord } from '@omne-harness/pi-ai-openai'
import { expectTypeOf, it } from 'vitest'

type Provenance = OpenAiResponsesRecord['provenance']

it('a Responses record names one source for every adaptation fact', () => {
  expectTypeOf<Provenance>().toEqualTypeOf<Readonly<Record<RecordFact, FactSource>>>()
})

it('a provenance without one of its facts does not compile', () => {
  const [record] = OPENAI_RECORDS
  const { engine: _engine, ...partial } = record.provenance
  // @ts-expect-error the source of the engine fact is missing
  const incomplete: Provenance = partial
  expectTypeOf(incomplete).toEqualTypeOf<Provenance>()
})
