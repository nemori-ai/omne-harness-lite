import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { CHECKPOINT_COMMAND, checkpointRequestSchema } from './checkpoint-schema.ts'
import { json, withinBudget } from './encoding.ts'
/** Carries the trusted coordinator's command. It is not caller or business authorization. */
export default {
  participant: 'settings.checkpoint-input',
  protocol: CHECKPOINT_COMMAND.protocol,
  execute(facts, port) {
    if (!withinBudget(facts))
      return { kind: 'failed', diagnostic: 'settings_checkpoint_input_limit' }
    port.provideFact(CHECKPOINT_COMMAND, json(checkpointRequestSchema.parse(facts['request'])))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
