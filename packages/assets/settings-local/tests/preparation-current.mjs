import { PREPARATION_CURRENT } from '../dist/finalization-schema.js'
export default {
  participant: 'fixture.preparation-current',
  protocol: 'fixture-preparation/1',
  execute(facts, port) {
    port.provideFact(PREPARATION_CURRENT, facts.current)
    return { kind: 'participated', response: null }
  },
}
