import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  ExecutionCurrentGuardSchema,
  SESSION_EXECUTION_CURRENT_FACT,
  SESSION_EXECUTION_GUARD,
} from '../execution-current.ts'
import { oneRow, text } from './support.ts'

export default {
  participant: SESSION_EXECUTION_GUARD,
  protocol: '1',
  execute(facts, port) {
    const parsed = ExecutionCurrentGuardSchema.safeParse(facts)
    if (!parsed.success)
      return { kind: 'unsupported', basis: { reason: 'execution-current-input' } }
    const { request } = parsed.data
    const row = oneRow(
      port,
      'SELECT revision FROM er_execution WHERE tenant = ? AND execution = ? AND session = ? LIMIT 1',
      [request.tenant, request.execution, request.session],
    )
    if (row === undefined || text(row['revision']) !== request.revision)
      return { kind: 'conflict', basis: { reason: 'execution-not-current' } }
    port.provideFact(SESSION_EXECUTION_CURRENT_FACT, request)
    return { kind: 'participated', response: request }
  },
} satisfies ParticipantModule
