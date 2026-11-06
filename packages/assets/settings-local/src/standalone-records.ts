import { z } from 'zod'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { StandaloneRecordSchema } from './standalone-schema.ts'
import { projectSettingsSources } from './source-layout.ts'

export function readStandaloneSettingsRecord(port: ReadPort, key: string) {
  const raw = port.execute('SELECT record FROM st_targets WHERE target_key = ? LIMIT 1', [key])
    .rows[0]?.[0]
  return raw === undefined ? null : StandaloneRecordSchema.parse(JSON.parse(z.string().parse(raw)))
}
export function projectStandaloneSettingsRecord(
  record: ReturnType<typeof StandaloneRecordSchema.parse>,
) {
  const { sourceLayout, ...view } = record.projection
  return sourceLayout.kind === 'bound'
    ? { ...view, sources: projectSettingsSources(sourceLayout.sources, view.ownerRevision) }
    : null
}
