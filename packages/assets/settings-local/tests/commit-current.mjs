import { COMMIT_CURRENT } from '../dist/commit-current.js'
export default {
  participant: 'fixture.commit-current',
  protocol: 'fixture-commit/1',
  execute(facts, port) {
    port.provideFact(COMMIT_CURRENT, facts.current)
    return { kind: 'participated', response: null }
  },
}
