import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { json, withinBudget } from './encoding.ts'
import { mutate } from './mutations.ts'
import { capture, guard } from './projection.ts'
import { PARTICIPANT, PROTOCOL, workerCommandSchema } from './schema.ts'
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'assets_input_budget' }
    const parsed = workerCommandSchema.safeParse(facts)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'assets_invalid_input' }
    const command = parsed.data
    if (command.kind === 'guard') return guard(port, command.binding)
    if (command.kind === 'capture') return capture(port, command.binding)
    if (command.kind === 'capturePublication') return capture(port, command.binding, true)
    const result = mutate(port, command.binding)
    const response = json({ binding: command.binding, result })
    return result.kind === 'committed'
      ? { kind: 'participated', response }
      : { kind: 'conflict', basis: response }
  },
} satisfies ParticipantModule
