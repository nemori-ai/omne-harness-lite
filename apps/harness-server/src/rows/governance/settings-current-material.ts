import { z } from 'zod'
import { canonicalDigest } from '@omne-harness/tool'
import {
  SettingsCommitCurrentSchema,
  SettingsPreparationCurrentSchema,
  type PreparationPlan,
} from '@omne-harness/settings-local/preparation'
import type { TargetSnapshot } from './target-snapshot.ts'

const standing = SettingsPreparationCurrentSchema.shape.standing.options[0]
export const settingsCurrentConfigurationSchema = standing
  .pick({ destination: true, required: true })
  .extend({
    sourceRoute: standing.shape.destination,
  })
export type SettingsCurrentConfiguration = z.infer<typeof settingsCurrentConfigurationSchema>
const materialSchema = SettingsCommitCurrentSchema.shape.observation.options[0].shape.material
export type SettingsCurrentMaterial = z.infer<typeof materialSchema>

/** Interprets native target grants. It does not decide whether a Tool action is permitted. */
export function settingsCurrentMaterial(
  snapshot: TargetSnapshot,
  configuration: SettingsCurrentConfiguration,
): SettingsCurrentMaterial | undefined {
  const { binding, values } = snapshot
  if (values.presence === 'unavailable') return undefined
  const { view, presence } = values
  if (
    view.sources.some(
      source =>
        source.scope.kind !== 'tenant' || source.scope.subjectRef !== binding.scope.tenantRef,
    )
  )
    return undefined
  const subjectRef = canonicalDigest({ scope: binding.scope, epoch: binding.epoch })
  const declaration = {
    ownerRef: 'governance',
    subjectRef,
    revision: canonicalDigest({
      declaration: snapshot.declaration.reference,
      revision: snapshot.declarationRevision,
      set: snapshot.declarationSetDigest,
    }),
  }
  const authority = {
    ownerRef: 'governance',
    subjectRef,
    revision: canonicalDigest({ mode: binding.mode, adoption: snapshot.adoptionRevision }),
  }
  const valueOriginRef = canonicalDigest({
    tenant: binding.scope.tenantRef,
    transactionDomain: binding.transactionDomain,
    target: view.target,
  })
  return materialSchema.parse({
    basis: {
      protocol: 'settings-current-basis/1',
      target: view.target,
      definitionRef: view.definitionRef,
      ownerRevision: view.ownerRevision,
      enabled: view.enabled,
      valueRevision: view.state.revision,
      sources: view.sources,
      declaration,
      selection: { kind: binding.mode === 'runtime' ? 'current' : 'not-required', authority },
      policies: [
        {
          policyRef: `settings.target-grants/${view.target.policyId}`,
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
      scopeRef: binding.scope.tenantRef,
      required: configuration.required,
    },
    sources: { route: configuration.sourceRoute, sources: [] },
    definition: view.definition,
    grants: view.grants,
  })
}

export function settingsCurrentPlan(material: SettingsCurrentMaterial): PreparationPlan {
  const { basis, standing, sources } = material
  return { kind: 'planned', purpose: { kind: 'target-change' }, basis, standing, sources }
}
