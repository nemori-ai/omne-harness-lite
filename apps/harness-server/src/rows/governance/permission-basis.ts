import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { GovernanceTargetBindingSchema } from '@omne-harness/governance-local'
import {
  PermissionBasisRequestSchema,
  PermissionConstraintSchema,
  PermissionEvaluationSchema,
} from '@omne-harness/permissions'
import {
  SESSION_PERMISSION_CURRENT_FACT,
  sessionPermissionGuardFacts,
} from '@omne-harness/session-storage-sql/participants'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { sessionPermissionObservationSchema } from './permission-session-current.ts'
import { targetSnapshotCommands, targetSnapshotFact } from './target-snapshot.ts'
import { unmappedPermissionSnapshotCommands } from './unmapped-permission-snapshot.ts'

export const PERMISSION_BASIS = { participant: 'harness.permission-basis', protocol: '1' }
export const permissionBasisFact = { key: 'harness.permission-basis', protocol: '1' }

export const permissionBasisRequestSchema = z.strictObject({
  snapshot: GovernanceTargetBindingSchema,
  permission: PermissionBasisRequestSchema,
  session: sessionPermissionObservationSchema,
  constraints: z.array(PermissionConstraintSchema).max(64),
  requiredConstraintIds: PermissionEvaluationSchema.shape.requiredConstraintIds,
})
export type PermissionBasisRequest = z.infer<typeof permissionBasisRequestSchema>

export const permissionBasisSchema = z.strictObject({
  permission: PermissionBasisRequestSchema,
  evaluation: PermissionEvaluationSchema,
})
export type PermissionBasis = z.infer<typeof permissionBasisSchema>

export function permissionBasisCommands(
  request: PermissionBasisRequest,
  configuration: 'mapped' | 'unmapped',
): readonly FactCommandV2[] {
  return [
    ...(configuration === 'unmapped'
      ? unmappedPermissionSnapshotCommands(request.snapshot)
      : targetSnapshotCommands(request.snapshot)),
    sessionPermissionGuardFacts(request.session),
    { participant: PERMISSION_BASIS.participant, facts: { request: z.json().parse(request) } },
  ]
}

type Participant = SqlMaterialCatalog['participants'][number]

function participant(
  identity: typeof PERMISSION_BASIS,
  name: string,
  facts: Pick<Participant, 'requiresFacts' | 'providesFacts'>,
): Participant {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    ...identity,
    moduleUrl: file.href,
    codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    ...facts,
  }
}

export const permissionBasisParticipant = (): Participant =>
  participant(PERMISSION_BASIS, 'permission-basis-participant', {
    requiresFacts: [targetSnapshotFact, SESSION_PERMISSION_CURRENT_FACT],
    providesFacts: [permissionBasisFact],
  })
