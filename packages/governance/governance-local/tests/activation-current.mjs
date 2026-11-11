import { ADOPTION_CURRENT } from '../dist/activation-schema.js'
export default {
  participant: 'fixture.governance-current',
  protocol: ADOPTION_CURRENT.protocol,
  execute(facts, port) {
    port.provideFact(ADOPTION_CURRENT, facts.evidence)
    return { kind: 'participated', response: null }
  },
}
