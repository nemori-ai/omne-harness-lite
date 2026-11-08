import { unmappedPermissionSnapshotCommands } from './unmapped-permission-snapshot.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalDigest } from '@omne-harness/tool'
import { PermissionBasisRequestSchema, PermissionEvaluationSchema } from '@omne-harness/permissions'
import {
  GovernancePermissionCurrentSchema,
  GovernanceTargetBindingSchema,
  governancePermissionCurrentFact,
  type PermissionProjectionRequest,
} from '@omne-harness/governance-local'
import type { GovernanceDefinitionRef } from '@omne-harness/governance-contract'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { targetSnapshotCommands, targetSnapshotFact } from './target-snapshot.ts'

export const PERMISSION_CURRENT_PARTICIPANT = 'harness.governance-permission-current'
export const permissionCurrentConfigurationSchema = z.strictObject({
  requiredConstraintIds: PermissionEvaluationSchema.shape.requiredConstraintIds,
})
export const permissionCurrentRequestSchema = GovernancePermissionCurrentSchema.omit({
  evaluation: true,
}).extend({
  permission: PermissionBasisRequestSchema,
  snapshot: GovernanceTargetBindingSchema,
})
export function permissionCurrentCommands(
  input: PermissionProjectionRequest,
  definition: GovernanceDefinitionRef,
  configuration: 'mapped' | 'unmapped' = 'mapped',
): readonly FactCommandV2[] {
  const snapshot = GovernanceTargetBindingSchema.parse({
    scope: input.binding.ref.scope,
    epoch: input.epoch,
    principalRef: input.binding.ref.principalRef,
    captureId: input.binding.ref.operationId,
    transactionDomain: input.transactionDomain,
    mode: 'runtime',
    definition,
    target: input.command.target,
  })
  return [
    ...(configuration === 'unmapped'
      ? unmappedPermissionSnapshotCommands(snapshot)
      : targetSnapshotCommands(snapshot)),
    {
      participant: PERMISSION_CURRENT_PARTICIPANT,
      facts: {
        request: z.json().parse({
          binding: input.binding,
          epoch: input.epoch,
          transactionDomain: input.transactionDomain,
          target: input.command.target,
          source: input.command.source,
          qualification: input.command.qualification,
          permission: input.command.permission,
          snapshot,
        }),
      },
    },
  ]
}
export function permissionCurrentParticipant(
  configuration: z.infer<typeof permissionCurrentConfigurationSchema>,
): SqlMaterialCatalog['participants'][number] {
  const parsed = permissionCurrentConfigurationSchema.parse(configuration)
  if (new Set(parsed.requiredConstraintIds).size !== parsed.requiredConstraintIds.length)
    throw new TypeError('Duplicate required constraint')
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./permission-current-participant.${extension}`, import.meta.url)
  const url = new URL(file)
  url.searchParams.set('configuration', JSON.stringify(parsed))
  return {
    participant: PERMISSION_CURRENT_PARTICIPANT,
    protocol: `harness-governance-permission-current/2/${canonicalDigest(parsed).slice(7)}`,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [targetSnapshotFact],
    providesFacts: [governancePermissionCurrentFact],
  }
}
