import { readSettingsIntent } from '../dist/intent-records.js'
import { readStandingCustody } from '../dist/standing-custody.js'
export default {
  handler: 'fixture.settings.intent-read',
  protocol: 'fixture-settings-intent/1',
  read(input, port) {
    return {
      kind: 'read',
      output:
        input.kind === 'standing'
          ? readStandingCustody(port, input.identity, input.attemptId)
          : readSettingsIntent(port, input),
    }
  },
}
