// The permission basis of one action, as a list of read-only commands. A projection read runs the
// commands for a check. The acceptance commit of a Tool start runs the same commands again and
// the basis guard compares the result with the digest that the check saw.
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
import { canonicalDigest } from '@omne-harness/tool'
import { sessionPermissionObservationSchema } from './permission-session-current.ts'
import { targetSnapshotCommands, targetSnapshotFact } from './target-snapshot.ts'
import { unmappedPermissionSnapshotCommands } from './unmapped-permission-snapshot.ts'

export const PERMISSION_BASIS = { participant: 'harness.permission-basis', protocol: '1' }
export const PERMISSION_BASIS_GUARD = {
  participant: 'harness.permission-basis-guard',
  protocol: '1',
}
export const permissionBasisFact = { key: 'harness.permission-basis', protocol: '1' }

export const permissionBasisRequestSchema = z.strictObject({
  snapshot: GovernanceTargetBindingSchema,
  permission: PermissionBasisRequestSchema,
  /** The Session permission that the caller read before it built the commands. */
  session: sessionPermissionObservationSchema,
  /** The constraints of the origin of the action, for example the bound Agent definition. */
  constraints: z.array(PermissionConstraintSchema).max(64),
  requiredConstraintIds: PermissionEvaluationSchema.shape.requiredConstraintIds,
})
export type PermissionBasisRequest = z.infer<typeof permissionBasisRequestSchema>

/** The facts of the tenant domain that decide the permission. Other domains are read apart. */
export const permissionBasisSchema = z.strictObject({
  permission: PermissionBasisRequestSchema,
  evaluation: PermissionEvaluationSchema,
})
export type PermissionBasis = z.infer<typeof permissionBasisSchema>

export const permissionBasisGuardSchema = z.strictObject({ digest: z.string() })

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

/** The condition of a commit: the basis of this transaction is the basis that the check saw. */
export function permissionBasisGuardCommand(basis: PermissionBasis): FactCommandV2 {
  return {
    participant: PERMISSION_BASIS_GUARD.participant,
    facts: { digest: canonicalDigest(basis) },
  }
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

export const permissionBasisGuardParticipant = (): Participant =>
  participant(PERMISSION_BASIS_GUARD, 'permission-basis-guard-participant', {
    requiresFacts: [permissionBasisFact],
    providesFacts: [],
  })
