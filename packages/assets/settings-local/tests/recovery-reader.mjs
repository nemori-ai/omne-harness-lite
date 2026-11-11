import { readSettingsIntent } from '../dist/intent-records.js'
import { readAttemptTerminal } from '../dist/attempt-terminal.js'
import { readSourceGate } from '../dist/source-retention-records.js'
export default {
  handler: 'fixture.recovery-read',
  protocol: 'fixture-recovery/1',
  read(input, port) {
    const binding = input.binding
    return {
      kind: 'read',
      output: {
        root: readSettingsIntent(port, binding.identity),
        terminal: binding.attemptId === null ? null : readAttemptTerminal(port, binding),
        gate: readSourceGate(port, {
          domain: binding.identity.domain,
          target: binding.identity.operation.target,
        }),
      },
    }
  },
}
