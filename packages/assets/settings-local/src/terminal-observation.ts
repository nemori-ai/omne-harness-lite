import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { finalizationRequestSchema, TERMINAL_OBSERVATION } from './finalization-schema.ts'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { readAttemptTerminal } from './attempt-terminal.ts'
import { json, withinBudget } from './encoding.ts'
export default {
  participant: TERMINAL_OBSERVATION.key,
  protocol: TERMINAL_OBSERVATION.protocol,
  execute(facts, port) {
    if (!withinBudget(facts))
      return { kind: 'failed', diagnostic: 'settings_terminal_observation_limit' }
    const request = finalizationRequestSchema.parse(facts['request'])
    if (request.binding.attemptId === null) {
      port.provideFact(TERMINAL_OBSERVATION, json({ request, observation: { kind: 'no-attempt' } }))
    } else {
      const terminal = readAttemptTerminal(
        port,
        settingsAttemptBindingSchema.parse(request.binding),
      )
      port.provideFact(
        TERMINAL_OBSERVATION,
        json({
          request,
          observation: terminal ? { kind: 'terminal', terminal } : { kind: 'absent' },
        }),
      )
    }
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
