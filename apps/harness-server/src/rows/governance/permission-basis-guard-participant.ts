import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonicalDigest } from '@omne-harness/tool'
import {
  PERMISSION_BASIS_GUARD,
  permissionBasisFact,
  permissionBasisGuardSchema,
} from './permission-basis.ts'

export default {
  ...PERMISSION_BASIS_GUARD,
  execute(facts, port) {
    const expected = permissionBasisGuardSchema.safeParse(facts)
    if (!expected.success)
      return { kind: 'unsupported', basis: { reason: 'permission-basis-guard-input' } }
    return canonicalDigest(port.requireFact(permissionBasisFact)) === expected.data.digest
      ? { kind: 'participated', response: null }
      : { kind: 'conflict', basis: { reason: 'permission-basis-changed' } }
  },
} satisfies ParticipantModule
