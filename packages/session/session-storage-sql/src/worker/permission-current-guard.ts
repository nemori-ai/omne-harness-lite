import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonicalText } from '../codec.ts'
import {
  SESSION_PERMISSION_CURRENT_FACT,
  SESSION_PERMISSION_GUARD,
  SessionPermissionGuardSchema,
} from '../permission-current.ts'
import { readPermissionCurrent } from './permission-current.ts'

export default {
  participant: SESSION_PERMISSION_GUARD,
  protocol: '1',
  execute(facts, port) {
    const parsed = SessionPermissionGuardSchema.safeParse(facts)
    if (!parsed.success)
      return { kind: 'unsupported', basis: { reason: 'session-permission-guard-input' } }
    const { request } = parsed.data
    const current = readPermissionCurrent(port, request)
    if (current.kind === 'not-ready')
      return { kind: 'conflict', basis: { reason: 'session-permission-not-ready' } }
    if (
      current.revision !== request.revision ||
      canonicalText(current.source) !== canonicalText(request.source)
    )
      return { kind: 'conflict', basis: { reason: 'session-permission-changed' } }
    port.provideFact(SESSION_PERMISSION_CURRENT_FACT, current)
    return { kind: 'participated', response: current }
  },
} satisfies ParticipantModule
