import { SOURCE_READINESS_FACT, sourceReadinessFactSchema } from '../dist/source-readiness.js'
import { equal } from '../dist/encoding.js'
export default {
  participant: 'fixture.source-readiness-sink',
  protocol: 'fixture-source-readiness/1',
  execute(facts, port) {
    const observed = sourceReadinessFactSchema.parse(port.requireFact(SOURCE_READINESS_FACT))
    if (!equal(observed.binding, facts.binding))
      return { kind: 'conflict', basis: { reason: 'binding' } }
    return { kind: 'participated', response: observed }
  },
}
