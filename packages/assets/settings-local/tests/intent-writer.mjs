import { allocateSettingsIntent } from '../dist/intent-records.js'
export default {
  participant: 'settings.persistence',
  protocol: 'settings-sql/1',
  execute(facts, port) {
    const response = allocateSettingsIntent(port, facts.input)
    if (facts.rollback) return { kind: 'conflict', basis: { reason: 'fixture-rollback' } }
    return { kind: 'participated', response }
  },
}
