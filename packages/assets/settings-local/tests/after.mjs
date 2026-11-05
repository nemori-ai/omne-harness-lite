import { settingsSqlResultFact } from '../dist/index.js'
export default {
  participant: 'fixture.settings.after',
  protocol: 'fixture-settings-after/1',
  execute(_facts, port) {
    const written = port.requireFact(settingsSqlResultFact)
    return {
      kind: 'conflict',
      basis: { binding: written.binding, failure: { kind: 'rejected', reason: 'forbidden' } },
    }
  },
}
