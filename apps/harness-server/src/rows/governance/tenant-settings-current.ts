import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { GovernanceTargetBindingSchema } from '@omne-harness/governance-local'
import {
  SettingsCommitCurrentSchema,
  SettingsPreparationCurrentSchema,
  settingsCommitCurrentFact,
  settingsPreparationCurrentFact,
} from '@omne-harness/settings-local/preparation'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import { targetSnapshotFact, type TargetSnapshot } from './target-snapshot.ts'

const standing = SettingsPreparationCurrentSchema.shape.standing.options[0]
export const tenantSettingsCurrentConfigurationSchema = standing
  .pick({ destination: true, required: true })
  .extend({ sourceRoute: standing.shape.destination })
export type TenantSettingsCurrentConfiguration = z.infer<
  typeof tenantSettingsCurrentConfigurationSchema
>
const materialSchema = SettingsCommitCurrentSchema.shape.observation.options[0].shape.material
export type TenantSettingsCurrentMaterial = z.infer<typeof materialSchema>
export const TENANT_SETTINGS_CONFIGURATION: TenantSettingsCurrentConfiguration = {
  destination: 'harness.governance.tenant-settings',
  sourceRoute: 'harness.governance.tenant-settings',
  required: [],
}

export const TENANT_SETTINGS_PHASES = ['ready', 'commit'] as const
export type TenantSettingsPhase = (typeof TENANT_SETTINGS_PHASES)[number]
export const tenantSettingsCurrentParticipant = (phase: TenantSettingsPhase) =>
  `harness.tenant-settings-current.${phase}`
export const tenantSettingsCurrentProtocol = (
  phase: TenantSettingsPhase,
  configuration: TenantSettingsCurrentConfiguration,
) =>
  `harness-tenant-settings-current/1/${phase}/${createHash('sha256').update(JSON.stringify(configuration)).digest('hex')}`

export const tenantSettingsCurrentRequestSchema = z.strictObject({
  binding: z.json(),
  snapshot: GovernanceTargetBindingSchema,
})

type ValueView = Extract<TargetSnapshot['values'], { presence: 'absent' | 'present' }>
type Revisioned = Readonly<{ ownerRef: string; subjectRef: string; revision: string }>

/** The current facts of one target and its values, as a settings write sees them in its transaction. */
export function settingsCurrentMaterial(input: {
  values: TargetSnapshot['values']
  tenantRef: string
  transactionDomain: string
  mode: 'management' | 'runtime'
  declaration: Revisioned
  authority: Revisioned
  configuration: TenantSettingsCurrentConfiguration
}): TenantSettingsCurrentMaterial | undefined {
  if (input.values.presence === 'unavailable') return undefined
  const { view, presence }: ValueView = input.values
  const { tenantRef, configuration } = input
  if (
    view.sources.some(
      source => source.scope.kind !== 'tenant' || source.scope.subjectRef !== tenantRef,
    )
  )
    return undefined
  const valueOriginRef = canonicalDigest({
    tenant: tenantRef,
    transactionDomain: input.transactionDomain,
    target: view.target,
  })
  const parsed = materialSchema.safeParse({
    basis: {
      protocol: 'settings-current-basis/1',
      target: view.target,
      definitionRef: view.definitionRef,
      ownerRevision: view.ownerRevision,
      enabled: view.enabled,
      valueRevision: view.state.revision,
      sources: view.sources,
      declaration: input.declaration,
      selection: {
        kind: input.mode === 'runtime' ? 'current' : 'not-required',
        authority: input.authority,
      },
      policies: [
        {
          policyRef: `settings.target-grants/${view.target.kind}`,
          interpretationRef: 'settings.decide-change/1',
          revision: canonicalDigest({ definition: view.definitionRef, grants: view.grants }),
          inputs: view.sources.map(source => ({
            source,
            valueOriginRef,
            valueRevision: String(view.state.revision),
            presence,
          })),
          constraints: [],
        },
      ],
    },
    standing: {
      kind: 'identity',
      destination: configuration.destination,
      scopeRef: tenantRef,
      required: configuration.required,
    },
    sources: { route: configuration.sourceRoute, sources: [] },
    definition: view.definition,
    grants: view.grants,
  })
  return parsed.success ? parsed.data : undefined
}

/** A release tool's target: the governance declaration and its adoption are part of the current facts. */
export function tenantSettingsCurrentMaterial(
  snapshot: TargetSnapshot,
  configuration: TenantSettingsCurrentConfiguration,
): TenantSettingsCurrentMaterial | undefined {
  const { binding } = snapshot
  const subjectRef = canonicalDigest({ scope: binding.scope, epoch: binding.epoch })
  return settingsCurrentMaterial({
    values: snapshot.values,
    tenantRef: binding.scope.tenantRef,
    transactionDomain: binding.transactionDomain,
    mode: binding.mode,
    declaration: {
      ownerRef: 'governance',
      subjectRef,
      revision: canonicalDigest({
        declaration: snapshot.declaration.reference,
        revision: snapshot.declarationRevision,
        set: snapshot.declarationSetDigest,
      }),
    },
    authority: {
      ownerRef: 'governance',
      subjectRef,
      revision: canonicalDigest({ mode: binding.mode, adoption: snapshot.adoptionRevision }),
    },
    configuration,
  })
}

export function tenantSettingsCurrentParticipants(
  configuration: TenantSettingsCurrentConfiguration,
): SqlMaterialCatalog['participants'] {
  const fixed = tenantSettingsCurrentConfigurationSchema.parse(configuration)
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./tenant-settings-current-participant.${extension}`, import.meta.url)
  const codeDigest = createHash('sha256').update(readFileSync(file)).digest('hex')
  return TENANT_SETTINGS_PHASES.map(phase => {
    const url = new URL(file)
    url.searchParams.set('phase', phase)
    url.searchParams.set('configuration', JSON.stringify(fixed))
    return {
      participant: tenantSettingsCurrentParticipant(phase),
      protocol: tenantSettingsCurrentProtocol(phase, fixed),
      moduleUrl: url.href,
      codeDigest,
      ownedTables: [],
      readTables: [],
      allowedFunctions: [],
      grouping: 'groupable',
      requiresFacts: [targetSnapshotFact],
      providesFacts: [
        phase === 'ready' ? settingsPreparationCurrentFact : settingsCommitCurrentFact,
      ],
    }
  })
}

export { SettingsCommitCurrentSchema, SettingsPreparationCurrentSchema }
