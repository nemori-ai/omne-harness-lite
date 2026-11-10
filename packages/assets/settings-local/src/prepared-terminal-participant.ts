import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  FINALIZATION_PLAN,
  FINALIZATION_TERMINAL,
  finalizationPlanSchema,
  finalizationRequestSchema,
} from './finalization-schema.ts'
import { readAttemptTerminal, recordAttemptTerminal } from './attempt-terminal.ts'
import { TERMINAL_PARTICIPANT, TERMINAL_PROTOCOL } from './terminal-schema.ts'
import { equal, json } from './encoding.ts'
export default {
  participant: TERMINAL_PARTICIPANT,
  protocol: TERMINAL_PROTOCOL,
  execute(facts, port) {
    const request = finalizationRequestSchema.parse(facts['request'])
    const plan = finalizationPlanSchema.parse(port.requireFact(FINALIZATION_PLAN))
    if (!equal(request, plan.request)) throw new Error('Settings terminal plan binding mismatch')
    if (plan.effect === 'prepare' && readAttemptTerminal(port, plan.request.binding) !== null)
      throw new Error('Settings preparation cannot reopen a terminal attempt')
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
