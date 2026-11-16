import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import {
  GovernanceDefinitionBindingSchema,
  GovernanceDefinitionProjectionSchema,
  governanceDefinitionProjectionFact,
} from '@omne-harness/governance-local'
import {
  judgePermissionAssignment,
  PermissionDefinitionRefSchema,
  PermissionRuleSchema,
  PermissionScopeSchema,
  PermissionSourceSchema,
  type PermissionConstraint,
  type PermissionDefinition,
} from '@omne-harness/permissions'
import {
  SessionCommitBasisSchema,
  SESSION_COMMIT_BASIS,
  sessionCommitDigest,
  type SessionCommitBasis,
} from '@omne-harness/session-storage-sql/participants'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { sessionPermissionMaterial } from './session-permission-material.ts'
import { targetSnapshotFact, type TargetSnapshot } from './target-snapshot.ts'

export const SESSION_PERMISSION_BASIS_MODES = ['clear', 'unmapped', 'mapped'] as const
export type SessionPermissionBasisMode = (typeof SESSION_PERMISSION_BASIS_MODES)[number]
export const sessionPermissionBasisConfigurationSchema = z.strictObject({
  mode: z.enum(SESSION_PERMISSION_BASIS_MODES),
  requiredConstraintIds: z.array(z.string().min(1)).max(64),
})
export type SessionPermissionBasisConfiguration = z.infer<
  typeof sessionPermissionBasisConfigurationSchema
>
export const sessionPermissionBasisProducer = (mode: SessionPermissionBasisMode) =>
  `harness.session-permission-basis.${mode}`
export function sessionPermissionBasisIdentity(configuration: SessionPermissionBasisConfiguration) {
  return {
    participant: sessionPermissionBasisProducer(configuration.mode),
    protocol: `harness-session-permission-basis/2/${createHash('sha256').update(canonicalText(configuration)).digest('hex')}`,
  }
}
export function sessionPermissionBasisParticipant(
  configuration: SessionPermissionBasisConfiguration,
): SqlMaterialCatalog['participants'][number] {
  const fixed = sessionPermissionBasisConfigurationSchema.parse(configuration)
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./session-permission-basis-participant.${extension}`, import.meta.url)
  const codeDigest = createHash('sha256').update(readFileSync(file)).digest('hex')
  file.searchParams.set('configuration', JSON.stringify(fixed))
  return {
    ...sessionPermissionBasisIdentity(fixed),
    moduleUrl: file.href,
    codeDigest,
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [
      ...(fixed.mode === 'clear' ? [] : [governanceDefinitionProjectionFact]),
      ...(fixed.mode === 'mapped' ? [targetSnapshotFact] : []),
    ],
    providesFacts: [SESSION_COMMIT_BASIS],
  }
}

const text = z.string().min(1)
export const sessionPermissionBasisFactsSchema = z.strictObject({
  commands: z
    .array(
      z.strictObject({ participant: z.literal('session'), facts: z.record(z.string(), z.json()) }),
    )
    .length(1),
  change: z.strictObject({
    operation: text,
    commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.string().regex(/^(0|[1-9][0-9]*)$/),
    authority: z.strictObject({ owner: text, record: text, revision: text, digest: text }),
  }),
  assignment: z.strictObject({
    capabilityId: text,
    enforcementKey: text,
    definition: PermissionDefinitionRefSchema,
    rule: PermissionRuleSchema.nullable(),
  }),
  selection: z
    .strictObject({
      binding: GovernanceDefinitionBindingSchema,
      scope: PermissionScopeSchema,
      organization: PermissionSourceSchema.nullable(),
    })
    .nullable(),
})
export type SessionPermissionBasisFacts = z.infer<typeof sessionPermissionBasisFactsSchema>

function currentDefinition(
  facts: SessionPermissionBasisFacts,
  selection: NonNullable<SessionPermissionBasisFacts['selection']>,
  rawProjection: unknown,
  configuration: SessionPermissionBasisConfiguration,
  values: TargetSnapshot | null,
): PermissionDefinition | undefined {
  const projection = GovernanceDefinitionProjectionSchema.safeParse(rawProjection)
  if (!projection.success) return undefined
  const constraints: PermissionConstraint[] = configuration.requiredConstraintIds.map(id => ({
    id,
    kind: 'unavailable',
    sourceRef: id,
  }))
  const material = sessionPermissionMaterial({
    binding: selection.binding,
    projection: projection.data,
    change: facts.assignment,
    scope: selection.scope,
    values,
    organization: selection.organization,
    requiredConstraintIds: configuration.requiredConstraintIds,
    constraints,
  })
  if (material === undefined || material.declaration.kind !== 'available') return undefined
  const definition = material.declaration.definition
  if ((definition.settings === null) !== (configuration.mode === 'unmapped')) return undefined
  const judgment = judgePermissionAssignment({
    layer: 'session',
    rule: facts.assignment.rule,
    current: material,
  })
  return judgment.kind === 'valid' ? definition : undefined
}

export function sessionPermissionWriteBasis(
  raw: unknown,
  projection: unknown,
  configuration: SessionPermissionBasisConfiguration,
  values: TargetSnapshot | null = null,
): SessionCommitBasis | null {
  const parsed = sessionPermissionBasisFactsSchema.safeParse(raw)
  if (!parsed.success) return null
  const facts = parsed.data
  const clear = facts.assignment.rule === null
  if (clear !== (configuration.mode === 'clear') || clear !== (facts.selection === null))
    return null
  const definition =
    facts.selection === null
      ? null
      : currentDefinition(facts, facts.selection, projection, configuration, values)
  if (definition === undefined) return null
  return SessionCommitBasisSchema.parse({
    kind: 'permission-change',
    commandsDigest: sessionCommitDigest(facts.commands),
    permissionChange: { ...facts.change, definition },
  })
}
