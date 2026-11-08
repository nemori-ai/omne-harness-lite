import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { ACTIVATION_PLAN } from './activation-schema.ts'
import { businessOriginal } from './business-plan.ts'
import {
  PERMISSION_CURRENT,
  PERMISSION_SNAPSHOT,
  permissionCurrentSchema,
} from './permission-capture-schema.ts'
import { json } from './encoding.ts'

export default {
  ...PERMISSION_SNAPSHOT,
  execute(facts, port) {
    const original = businessOriginal(port, facts['request'], 'capture')
    if (original.kind === 'observation') {
      port.provideFact(ACTIVATION_PLAN, json(original))
      return { kind: 'participated', response: null }
    }
    const current = permissionCurrentSchema.parse(port.requireFact(PERMISSION_CURRENT))
    port.provideFact(ACTIVATION_PLAN, json({ ...original, kind: 'permission-capture', current }))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
