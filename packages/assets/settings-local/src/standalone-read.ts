import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { STANDALONE_READ, standaloneReadRequestSchema } from './standalone-read-schema.ts'
import {
  isIndependentTargetInDomain,
  projectStandaloneSettingsRecord,
  readStandaloneSettingsRecord,
} from './standalone-records.ts'
import { equal, json, stateKey } from './encoding.ts'

export default {
  ...STANDALONE_READ,
  read(raw, port) {
    const { domain, target } = standaloneReadRequestSchema.parse(raw)
    if (!isIndependentTargetInDomain(domain, target))
      return { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } }
    const record = readStandaloneSettingsRecord(port, stateKey(domain.scope, target))
    if (record === null) return { kind: 'read', output: { kind: 'not_found' } }
    const projection = projectStandaloneSettingsRecord(record)
    if (projection === null || !equal(projection.target, target))
      return { kind: 'read', output: { kind: 'rejected', reason: 'unavailable' } }
    return { kind: 'read', output: json({ kind: 'found', projection, retired: record.retired }) }
  },
} satisfies ReadHandlerModule
