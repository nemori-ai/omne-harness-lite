import { commitGoal, type CommitCommand } from '@omne-harness/goal'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { sqlTxn } from './facts.ts'
import { PARTICIPANT, PROTOCOL } from './schema.ts'

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    if (facts['script'] !== 'commit') return { kind: 'failed', diagnostic: 'unknown_goal_script' }
    const result = commitGoal(sqlTxn(port), facts['command'] as unknown as CommitCommand)
    return { kind: 'participated', response: result as unknown as JsonValue }
  },
} satisfies ParticipantModule
