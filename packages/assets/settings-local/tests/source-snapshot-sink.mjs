import { sourceSnapshotFactSchema, SOURCE_SNAPSHOT_FACT } from '../dist/source-snapshot.js'
import { equal } from '../dist/encoding.js'
export default {
  participant: 'fixture.source-snapshot-sink',
  protocol: 'fixture-source-snapshot/1',
  execute(facts, port) {
    const fact = sourceSnapshotFactSchema.parse(port.requireFact(SOURCE_SNAPSHOT_FACT))
    if (!equal(fact.request, facts.request))
      return { kind: 'conflict', basis: { reason: 'fixture-binding' } }
    return { kind: 'participated', response: fact.observation }
  },
}
