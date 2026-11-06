import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  FINALIZATION_PLAN,
  FINALIZATION_TERMINAL,
  recoveryPlanSchema,
  recoveryRequestSchema,
} from './finalization-schema.ts'
import { readAttemptTerminal, recordAttemptTerminal } from './attempt-terminal.ts'
import { TERMINAL_PARTICIPANT, TERMINAL_PROTOCOL } from './terminal-schema.ts'
import { equal, json } from './encoding.ts'
export default {
  participant: TERMINAL_PARTICIPANT,
  protocol: TERMINAL_PROTOCOL,
  execute(facts, port) {
    const request = recoveryRequestSchema.parse(facts['request'])
    const plan = recoveryPlanSchema.parse(port.requireFact(FINALIZATION_PLAN))
    if (!equal(request, plan.request)) throw new Error('Settings terminal plan binding mismatch')
    if (plan.terminal) {
      if (plan.effect === 'recognize') {
        if (!equal(readAttemptTerminal(port, plan.terminal.binding), plan.terminal))
          throw new Error('Settings terminal recognition mismatch')
      } else recordAttemptTerminal(port, plan.terminal)
    }
    port.provideFact(FINALIZATION_TERMINAL, json({ request, terminal: plan.terminal }))
    return { kind: 'participated', response: json(plan.terminal) }
  },
} satisfies ParticipantModule
