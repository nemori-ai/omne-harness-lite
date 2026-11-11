import { RESULT_FACT } from '../dist/schema.js'
export default {
  participant: 'fixture.recovery-rollback',
  protocol: 'fixture-recovery/1',
  execute(facts, port) {
    const result = port.requireFact(RESULT_FACT)
    return facts.rollback
      ? { kind: 'conflict', basis: { reason: 'forced-after-persistence' } }
      : { kind: 'participated', response: result }
  },
}
