import type { SessionLogConsequence } from './projection.ts'
import type { SessionUninterpretedCall } from './history-values.ts'
import type { ProducerRef } from './values.ts'

function producerOf(item: SessionLogConsequence): ProducerRef | null | undefined {
  switch (item.kind) {
    case 'call-registration':
      return item.registration.kind === 'associated' ? item.registration.binding.producer : null
    case 'call-association':
    case 'call':
    case 'producer':
      return item.binding.producer
    default:
      return undefined
  }
}

export function uninterpretedCalls(
  execution: string,
  facts: Iterable<Readonly<{ sequence: string; consequences: readonly SessionLogConsequence[] }>>,
): SessionUninterpretedCall[] {
  const calls: SessionUninterpretedCall[] = []
  for (const fact of facts)
    for (const item of fact.consequences) {
      const producer = producerOf(item)
      if (producer !== undefined && 'consumption' in item)
        calls.push({ execution, sequence: fact.sequence, consumption: item.consumption, producer })
    }
  return calls
}
