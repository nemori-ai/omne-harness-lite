// Named test adapter: business qualification/definition are fixtures, Session and SQL are real.
import {
  SessionCommitBasisSchema,
  SESSION_COMMIT_BASIS,
  sessionCommitDigest,
} from '@omne-harness/session-storage-sql/participants'
const GOVERNANCE_BASIS = {
  key: 'governance.external-write-basis',
  protocol: 'governance-external-write-basis/1',
}
export default {
  participant: 'fixture.external-session-basis',
  protocol: 'fixture-external-session-basis/1',
  execute(_facts, port) {
    const original = port.requireFact(GOVERNANCE_BASIS)
    const own = original.request.execution.authority.commands.filter(
      command => command.participant === 'session',
    )
    const qualification = original.command.write.qualification
    const coordination = {
      owner: 'governance',
      record: original.request.binding.ref.operationId,
      revision: original.epoch,
      digest: `sha256:${original.request.binding.requestDigest}`,
    }
    const basis = SessionCommitBasisSchema.parse({
      kind: 'permission-change',
      commandsDigest: sessionCommitDigest(own),
      coordination,
      permissionChange: {
        operation: original.request.binding.ref.operationId,
        commandDigest: original.command.write.commandDigest,
        revision: qualification.permissionRevision,
        definition: qualification.definition,
        authority: qualification.policy,
      },
    })
    port.provideFact(SESSION_COMMIT_BASIS, basis)
    return { kind: 'participated', response: null }
  },
}
