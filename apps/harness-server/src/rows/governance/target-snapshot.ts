import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import {
  GovernanceDefinitionBundleSchema,
  GovernanceDigestSchema,
  GovernanceRevisionSchema,
  EnforcementBindingSchema,
} from '@omne-harness/governance-contract'
import {
  GovernanceTargetBindingSchema,
  governanceTargetProjectionCommand,
  governanceTargetProjectionFact,
  type GovernanceTargetBinding,
} from '@omne-harness/governance-local'
import { assetsPublicationCommand } from '@omne-harness/assets-local'
import {
  SettingsProjectionBindingSchema,
  SettingsValueProjectionSchema,
  settingsValueProjectionCommand,
  settingsValueProjectionFact,
  standaloneSettingsPublicationCommand,
} from '@omne-harness/settings-local'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { governanceCurrentParticipant } from './adoption-current.ts'
import { SUPPORT_PARTICIPANT } from './permission-protocol.ts'

export const TARGET_SNAPSHOT = { participant: 'harness.governance-target-snapshot', protocol: '1' }
export const targetSnapshotFact = { key: 'harness.governance-target-snapshot', protocol: '1' }
export const targetSnapshotSchema = z.strictObject({
  binding: GovernanceTargetBindingSchema,
  declaration: GovernanceDefinitionBundleSchema,
  declarationRevision: GovernanceRevisionSchema,
  adoptionRevision: GovernanceRevisionSchema,
  declarationSetDigest: GovernanceDigestSchema,
  values: SettingsValueProjectionSchema.shape.views.element,
  enforcementBindings: z.array(EnforcementBindingSchema).max(128),
})
export type TargetSnapshot = z.infer<typeof targetSnapshotSchema>

export function targetCapture(binding: GovernanceTargetBinding) {
  return SettingsProjectionBindingSchema.parse({
    domain: {
      scope: { kind: 'tenant', tenant: binding.scope.tenantRef },
      transactionDomain: binding.transactionDomain,
    },
    principalRef: binding.principalRef,
    captureId: binding.captureId,
    request: {
      deploymentRef: binding.scope.deploymentId,
      mode: binding.mode,
      targets: [binding.target],
      selectionRef: null,
    },
  })
}

export function targetSnapshotCommands(binding: GovernanceTargetBinding): readonly FactCommandV2[] {
  const capture = targetCapture(binding)
  return [
    { participant: 'harness.tool-permission-release', facts: {} },
    { participant: SUPPORT_PARTICIPANT.participant, facts: {} },
    assetsPublicationCommand(capture),
    standaloneSettingsPublicationCommand(capture),
    governanceTargetProjectionCommand(binding),
    settingsValueProjectionCommand(capture),
    { participant: TARGET_SNAPSHOT.participant, facts: { binding: z.json().parse(binding) } },
  ]
}

export function targetSnapshotParticipant(): SqlMaterialCatalog['participants'][number] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./target-snapshot-participant.${extension}`, import.meta.url)
  const native = governanceCurrentParticipant()
  return {
    ...native,
    ...TARGET_SNAPSHOT,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
    requiresFacts: [
      ...native.requiresFacts,
      governanceTargetProjectionFact,
      settingsValueProjectionFact,
    ],
    providesFacts: [targetSnapshotFact],
  }
}
