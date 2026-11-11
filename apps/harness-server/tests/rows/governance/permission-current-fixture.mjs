import { PERMISSION_CURRENT } from '../../../dist/rows/governance/permission-protocol.js'
export default {
  participant: 'fixture.permission-current',
  protocol: '1',
  execute(facts, port) {
    port.provideFact(PERMISSION_CURRENT, facts.current)
    return { kind: 'participated', response: null }
  },
}
