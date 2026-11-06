import { sourceSnapshotFactSchema, SOURCE_SNAPSHOT_FACT } from '../dist/source-snapshot.js'
import { equal } from '../dist/encoding.js'
import { readSourceReservation, reserveSource } from '../dist/source-retention-records.js'
export default {
  participant: 'settings.source-retention',
  protocol: 'settings-source-retention/1',
  execute(facts, port) {
    const fact = sourceSnapshotFactSchema.parse(port.requireFact(SOURCE_SNAPSHOT_FACT))
    if (!equal(fact.request, facts.request))
      return { kind: 'conflict', basis: { reason: 'fixture-binding' } }
    if (!facts.hold) return { kind: 'participated', response: fact.observation }
    const previous = readSourceReservation(port, fact.request)
    if (previous.kind !== 'not_found') return { kind: 'participated', response: previous }
    return {
      kind: 'participated',
      response:
        fact.observation.kind === 'captured'
          ? reserveSource(port, fact.request, fact.observation.snapshot)
          : fact.observation,
    }
  },
}
