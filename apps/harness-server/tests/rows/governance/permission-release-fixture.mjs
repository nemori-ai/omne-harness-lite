import { PERMISSION_RELEASES } from '../../../dist/rows/governance/permission-protocol.js'
export default {
  participant: 'fixture.permission-release',
  protocol: '1',
  execute(facts, port) {
    port.provideFact(PERMISSION_RELEASES, facts.released)
    return { kind: 'participated', response: null }
  },
}
