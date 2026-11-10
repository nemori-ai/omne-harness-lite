// The failure switch is stored in the original execution and fires after the real Session writer.
import { sessionPermissionWriteResult } from '../../../dist/rows/governance/session-permission-result.js'
import {
  SessionCommitResultSchema,
  SESSION_COMMIT_RESULT,
} from '@omne-harness/session-storage-sql/participants'
const BASIS = {
  key: 'governance.external-write-basis',
  protocol: 'governance-external-write-basis/1',
}
const RESULT = {
  key: 'governance.external-write-result',
  protocol: 'governance-external-write-result/1',
}
export default {
  participant: 'fixture.external-session-result',
  protocol: 'fixture-external-session-result/1',
  execute(facts, port) {
    const original = port.requireFact(BASIS)
    const result = SessionCommitResultSchema.parse(port.requireFact(SESSION_COMMIT_RESULT))
    if (facts.fault === 'after-session') throw new Error('fixture failure after real Session write')
    if (facts.fault === 'session-result-coordination')
      result.coordination.record = 'other-operation'
    if (facts.fault === 'session-result-operation') result.operation = 'other-operation'
    if (facts.fault === 'session-result-commands')
      result.commandsDigest = `sha256:${'b'.repeat(64)}`
    if (facts.fault === 'session-reply-digest') result.response.digest = 'b'.repeat(64)
    if (facts.fault === 'session-reply-invalid')
      result.response.result = { $tenant: 'invalid-tenant' }
    const published = sessionPermissionWriteResult(original, result)
    if (published === null)
      return { kind: 'unsupported', basis: { reason: 'session-result-binding' } }
    if (facts.fault === 'wrong-binding')
      published.binding = { ...published.binding, requestDigest: 'b'.repeat(64) }
    if (facts.fault === 'wrong-execution') published.executionDigest = 'b'.repeat(64)
    if (facts.fault === 'wrong-writer') published.writer = 'other-writer'
    port.provideFact(RESULT, published)
    return { kind: 'participated', response: null }
  },
}
