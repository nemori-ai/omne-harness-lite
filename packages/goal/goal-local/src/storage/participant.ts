import { commitGoal, type CommitCommand } from '@omne-harness/goal'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { choose, sqlTxn } from './facts.ts'
import { PARTICIPANT, PROTOCOL } from './schema.ts'

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    if (facts['script'] === 'choose') {
      const { session, judge } = facts['command'] as { session: string; judge: string | null }
      choose(port, session, judge)
      return { kind: 'participated', response: null }
    }
    if (facts['script'] !== 'commit') return { kind: 'failed', diagnostic: 'unknown_goal_script' }
    const result = commitGoal(sqlTxn(port), facts['command'] as unknown as CommitCommand)
    return { kind: 'participated', response: result as unknown as JsonValue }
  },
} satisfies ParticipantModule
