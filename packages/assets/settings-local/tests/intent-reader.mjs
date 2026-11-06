import { readSettingsIntent } from '../dist/intent-records.js'
export default {
  handler: 'fixture.settings.intent-read',
  protocol: 'fixture-settings-intent/1',
  read(input, port) {
    return { kind: 'read', output: readSettingsIntent(port, input) }
  },
}
