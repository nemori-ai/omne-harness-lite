import { VALUE_FACT } from './owner.mjs'
export default {
  participant: 'fixture.projection-join',
  protocol: '1',
  execute(facts, port) {
    const value = port.requireFact(VALUE_FACT)
    if (facts.expected !== undefined && facts.expected !== value)
      return { kind: 'conflict', basis: { reason: 'value-changed' } }
    return { kind: 'participated', response: { joined: value } }
  },
}
