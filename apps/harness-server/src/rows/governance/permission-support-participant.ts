import { canonicalText } from '@omne-harness/authorization'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import {
  permissionInterpretationSchema,
  resolvePermissionInterpretation,
} from './permission-interpretation.ts'
import {
  PERMISSION_RELEASES,
  PERMISSION_SUPPORT,
  SUPPORT_PARTICIPANT,
} from './permission-protocol.ts'

export const permissionSupportSchema = z.array(permissionInterpretationSchema).max(128)

export default {
  ...SUPPORT_PARTICIPANT,
  execute(_facts, port) {
    const released = permissionSupportSchema.safeParse(port.requireFact(PERMISSION_RELEASES))
    if (!released.success) return { kind: 'unsupported', basis: { reason: 'release-material' } }
    const bindings = new Set<string>()
    for (const interpretation of released.data) {
      const key = canonicalText(interpretation.binding)
      const support = resolvePermissionInterpretation(interpretation, interpretation.binding)
      if (bindings.has(key) || support.kind !== 'supported')
        return { kind: 'unsupported', basis: { reason: 'interpretation' } }
      bindings.add(key)
    }
    port.provideFact(PERMISSION_SUPPORT, released.data)
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
