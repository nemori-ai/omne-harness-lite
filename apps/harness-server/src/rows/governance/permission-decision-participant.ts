import { canonicalText } from '@omne-harness/authorization'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { interpretPermission, permissionActionSchema } from './permission-interpreter.ts'
import { permissionSupportSchema } from './permission-support-participant.ts'
import {
  DECISION_PARTICIPANT,
  PERMISSION_CURRENT,
  PERMISSION_SUPPORT,
} from './permission-protocol.ts'

export default {
  ...DECISION_PARTICIPANT,
  execute(facts, port) {
    const action = permissionActionSchema.safeParse(facts['action'])
    if (!action.success)
      return { kind: 'participated', response: { kind: 'unavailable', reason: 'material' } }
    const supported = permissionSupportSchema.parse(port.requireFact(PERMISSION_SUPPORT))
    const binding = canonicalText(action.data.binding)
    const released = supported.find(candidate => canonicalText(candidate.binding) === binding)
    const response = interpretPermission({
      released,
      action: action.data,
      current: port.requireFact(PERMISSION_CURRENT),
    })
    return { kind: 'participated', response }
  },
} satisfies ParticipantModule
