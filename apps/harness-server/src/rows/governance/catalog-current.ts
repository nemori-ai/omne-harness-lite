import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import {
  GovernanceCatalogBindingSchema,
  governanceCatalogCurrentFact,
  type GovernanceCatalogBinding,
} from '@omne-harness/governance-local'
import { assetsPublicationCommand } from '@omne-harness/assets-local'
import {
  SettingsProjectionBindingSchema,
  standaloneSettingsPublicationCommand,
} from '@omne-harness/settings-local'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { governanceCurrentParticipant } from './adoption-current.ts'
import { SUPPORT_PARTICIPANT } from './permission-protocol.ts'

export const CATALOG_CURRENT_PARTICIPANT = {
  participant: 'harness.governance-catalog-current',
  protocol: '1',
}
export const catalogCurrentRequestSchema = z.strictObject({
  binding: GovernanceCatalogBindingSchema,
  capture: SettingsProjectionBindingSchema,
})
export function catalogCapture(binding: GovernanceCatalogBinding) {
  return SettingsProjectionBindingSchema.parse({
    domain: {
      scope: { kind: 'tenant', tenant: binding.scope.tenantRef },
      transactionDomain: binding.transactionDomain,
    },
    principalRef: binding.principalRef,
    captureId: binding.captureId,
    request: {
      deploymentRef: binding.scope.deploymentId,
      mode: 'management',
      targets: [],
      selectionRef: null,
    },
  })
}
export function governanceCatalogProjection(
  binding: GovernanceCatalogBinding,
): readonly FactCommandV2[] {
  const capture = catalogCapture(binding)
  return [
    { participant: 'harness.tool-permission-release', facts: {} },
    { participant: SUPPORT_PARTICIPANT.participant, facts: {} },
    assetsPublicationCommand(capture),
    standaloneSettingsPublicationCommand(capture),
    {
      participant: CATALOG_CURRENT_PARTICIPANT.participant,
      facts: { request: z.json().parse({ binding, capture }) },
    },
  ]
}
export function governanceCatalogCurrentParticipant(): SqlMaterialCatalog['participants'][number] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./catalog-current-participant.${extension}`, import.meta.url)
  return {
    ...governanceCurrentParticipant(),
    ...CATALOG_CURRENT_PARTICIPANT,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
    providesFacts: [governanceCatalogCurrentFact],
  }
}
