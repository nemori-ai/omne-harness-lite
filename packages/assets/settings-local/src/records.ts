import { z } from 'zod'
import type { SettingsTarget } from '@omne-harness/settings'
import type { StorageScope } from '@omne-harness/sql-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { equal, stateKey } from './encoding.ts'
import { stateRecordSchema } from './schema.ts'

export function readStateRecord(port: ReadPort, scope: StorageScope, target: SettingsTarget) {
  const row = port.execute('SELECT record FROM st_states WHERE target_key = ? LIMIT 1', [
    stateKey(scope, target),
  ]).rows[0]
  if (!row) return null
  const record = stateRecordSchema.parse(JSON.parse(z.string().parse(row[0])))
  if (!equal(record.scope, scope) || !equal(record.target, target))
    throw new Error('Invalid stored state binding')
  return record
}
