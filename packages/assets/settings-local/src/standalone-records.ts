import { organizationCodec } from '@omne-harness/legal-identity'
import type { SettingsTarget } from '@omne-harness/settings'
import type { DomainRef } from '@omne-harness/sql-contract'
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

export function isIndependentTargetInDomain(domain: DomainRef, target: SettingsTarget) {
  if (target.policyId !== 'independent') return false
  return domain.scope.kind === 'tenant'
    ? target.scopeRef === domain.scope.tenant
    : domain.transactionDomain === 'system.settings' && organizationCodec.parse(target.scopeRef).ok
}
