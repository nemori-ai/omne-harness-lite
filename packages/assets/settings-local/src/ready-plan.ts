import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  FINALIZATION_PLAN,
  PREPARATION_CURRENT,
  TERMINAL_OBSERVATION,
  preparationCurrentSchema,
  readyPlanSchema,
  readyRequestSchema,
  terminalObservationSchema,
} from './finalization-schema.ts'
import { equal, json, withinBudget } from './encoding.ts'

export default {
  participant: 'settings.ready-plan',
  protocol: FINALIZATION_PLAN.protocol,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'settings_ready_plan_limit' }
    const request = readyRequestSchema.parse(facts['request'])
    const rawCurrent = port.requireFact(PREPARATION_CURRENT)
    if (!withinBudget(rawCurrent))
      return { kind: 'failed', diagnostic: 'settings_ready_current_limit' }
    const current = preparationCurrentSchema.parse(rawCurrent)
    const observed = terminalObservationSchema.parse(port.requireFact(TERMINAL_OBSERVATION))
    if (!equal(current.binding, request.binding) || !equal(observed.request, request))
      throw new Error('Settings ready observation binding mismatch')
    if (observed.observation.kind !== 'absent')
      return { kind: 'conflict', basis: { reason: 'settings_attempt_terminal' } }
    const plan = readyPlanSchema.parse({
      request,
      terminal: null,
      effect: 'prepare',
      source: { kind: 'none' },
      preparation: { ...current, terminal: { kind: 'open', binding: request.binding } },
    })
    port.provideFact(FINALIZATION_PLAN, json(plan))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
