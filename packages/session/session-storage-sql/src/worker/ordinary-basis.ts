import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  SESSION_COMMIT_BASIS,
  SESSION_ORDINARY_BASIS,
  SessionBasisCommandsSchema,
  ordinarySessionFacts,
  sessionCommitDigest,
} from '../commit-basis.ts'

const participant: ParticipantModule = {
  participant: SESSION_ORDINARY_BASIS,
  protocol: '1',
  execute(facts, port) {
    const parsed = SessionBasisCommandsSchema.safeParse(facts)
    if (
      !parsed.success ||
      !parsed.data.commands.every(command => ordinarySessionFacts(command.facts))
    )
      return { kind: 'unsupported', basis: { reason: 'not an ordinary Session command' } }
    port.provideFact(SESSION_COMMIT_BASIS, {
      kind: 'ordinary',
      commandsDigest: sessionCommitDigest(parsed.data.commands),
    })
    return { kind: 'participated', response: null }
  },
}
export default participant
