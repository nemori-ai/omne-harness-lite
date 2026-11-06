import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  FINALIZATION_PLAN,
  FINALIZATION_TERMINAL,
  recoveryPlanSchema,
  recoveryRequestSchema,
  finalizationTerminalSchema,
} from './finalization-schema.ts'
import { SOURCE_SNAPSHOT_FACT } from './source-retention-schema.ts'
import { equal, json } from './encoding.ts'
export default {
  participant: 'settings.source-finalization',
  protocol: 'settings-finalization/1',
  execute(facts, port) {
    const request = recoveryRequestSchema.parse(facts['request'])
    const plan = recoveryPlanSchema.parse(port.requireFact(FINALIZATION_PLAN))
    const terminal = finalizationTerminalSchema.parse(port.requireFact(FINALIZATION_TERMINAL))
    if (!equal(request, plan.request) || !equal(terminal, { request, terminal: plan.terminal }))
      throw new Error('Settings source finalization binding mismatch')
    port.provideFact(
      SOURCE_SNAPSHOT_FACT,
      json({ kind: 'finalization', request, action: plan.source }),
    )
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
