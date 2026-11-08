import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { assetsPublicationCommand, assetsPublicationFact } from '@omne-harness/assets-local'
import {
  governanceSelectedDefinitionCommand,
  governanceSelectedDefinitionFact,
  type GovernanceTargetBinding,
} from '@omne-harness/governance-local'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { targetCapture, targetSnapshotFact, targetSnapshotSchema } from './target-snapshot.ts'
import { GOVERNANCE_PUBLICATIONS } from './current-publications.ts'
import { PERMISSION_SUPPORT, SUPPORT_PARTICIPANT } from './permission-protocol.ts'

export const UNMAPPED_PERMISSION_SNAPSHOT = {
  participant: 'harness.permission-unmapped-snapshot',
  protocol: 'harness-permission-unmapped-snapshot/1',
}
export const unmappedPermissionSnapshotSchema = targetSnapshotSchema.omit({ values: true }).extend({
  kind: z.literal('unmapped'),
  ownerRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})
export const permissionTargetSnapshotSchema = z.union([
  targetSnapshotSchema,
  unmappedPermissionSnapshotSchema,
])
export type PermissionTargetSnapshot = z.infer<typeof permissionTargetSnapshotSchema>

export function selectedDefinitionBinding(binding: GovernanceTargetBinding) {
  const { mode: _mode, target: _target, ...definition } = binding
  return definition
}
export function unmappedPermissionSnapshotCommands(
  binding: GovernanceTargetBinding,
): readonly FactCommandV2[] {
  return [
    { participant: 'harness.tool-permission-release', facts: {} },
    { participant: SUPPORT_PARTICIPANT.participant, facts: {} },
    assetsPublicationCommand(targetCapture(binding)),
    governanceSelectedDefinitionCommand(selectedDefinitionBinding(binding)),
    {
      participant: UNMAPPED_PERMISSION_SNAPSHOT.participant,
      facts: { binding: z.json().parse(binding) },
    },
  ]
}
export function unmappedPermissionSnapshotParticipant(): SqlMaterialCatalog['participants'][number] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./unmapped-permission-snapshot-participant.${extension}`, import.meta.url)
  return {
    ...UNMAPPED_PERMISSION_SNAPSHOT,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [
      assetsPublicationFact,
      governanceSelectedDefinitionFact,
      GOVERNANCE_PUBLICATIONS,
      PERMISSION_SUPPORT,
    ],
    providesFacts: [targetSnapshotFact],
  }
}
