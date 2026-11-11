import { readSourceCustody, listSourceCustody } from '../dist/source-custody.js'
import { readSettingsIntent } from '../dist/intent-records.js'
import { readStandingCustody } from '../dist/standing-custody.js'
export default {
  handler: 'fixture.settings.intent-read',
  protocol: 'fixture-settings-intent/1',
  read(input, port) {
    if (input.kind === 'source')
      return { kind: 'read', output: readSourceCustody(port, input.input) }
    if (input.kind === 'sources')
      return { kind: 'read', output: listSourceCustody(port, input.input) }
    return {
      kind: 'read',
      output:
        input.kind === 'standing'
          ? readStandingCustody(port, input.identity, input.attemptId)
          : readSettingsIntent(port, input),
    }
  },
}
