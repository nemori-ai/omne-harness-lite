import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalDigest } from '@omne-harness/tool'
import {
  SettingsCommitCurrentSchema,
  SettingsPreparationCurrentSchema,
  secretItemsOf,
  settingsCommitCurrentFact,
  settingsPreparationCurrentFact,
  type SettingsPreparationOptions,
} from '@omne-harness/settings-local/preparation'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import type { TargetSnapshot } from '../../../src/rows/governance/target-snapshot.ts'

const standing = SettingsPreparationCurrentSchema.shape.standing.options[0]
const settingsCurrentConfigurationSchema = standing
  .pick({ destination: true, required: true })
  .extend({
    sourceRoute: standing.shape.destination,
  })
export type SettingsCurrentConfiguration = z.infer<typeof settingsCurrentConfigurationSchema>
const materialSchema = SettingsCommitCurrentSchema.shape.observation.options[0].shape.material
type SettingsCurrentMaterial = z.infer<typeof materialSchema>

function settingsCurrentMaterial(
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

export const SETTINGS_SEED_READY = 'fixture.preparation-current'
export const SETTINGS_SEED_COMMIT = 'fixture.commit-current'

export function settingsSeedParticipants(): SqlMaterialCatalog['participants'] {
  const fixture = (
    file: string,
    participant: string,
    protocol: string,
    fact: SqlMaterialCatalog['participants'][number]['providesFacts'][number],
  ): SqlMaterialCatalog['participants'][number] => {
    const url = new URL(
      `../../../../../packages/assets/settings-local/tests/${file}.mjs`,
      import.meta.url,
    )
    return {
      participant,
      protocol,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
      ownedTables: [],
      readTables: [],
      requiresFacts: [],
      providesFacts: [fact],
      allowedFunctions: [],
      grouping: 'groupable',
    }
  }
  return [
    fixture(
      'preparation-current',
      SETTINGS_SEED_READY,
      'fixture-preparation/1',
      settingsPreparationCurrentFact,
    ),
    fixture('commit-current', SETTINGS_SEED_COMMIT, 'fixture-commit/1', settingsCommitCurrentFact),
  ]
}

export function settingsSeedCurrent<Context>(options: {
  snapshot: () => Promise<TargetSnapshot>
  configuration: SettingsCurrentConfiguration
}): Pick<SettingsPreparationOptions<Context>, 'plan' | 'currentCommands'> {
  const configuration = settingsCurrentConfigurationSchema.parse(options.configuration)
  let material: SettingsCurrentMaterial | undefined
  return {
    async plan() {
      material = settingsCurrentMaterial(await options.snapshot(), configuration)
      if (material === undefined) return { kind: 'rejected', reason: 'unavailable' }
      const { basis, standing, sources, definition } = material
      return {
        kind: 'planned',
        purpose: { kind: 'target-change' },
        basis,
        standing,
        sources,
        secretItems: secretItemsOf(definition),
      }
    },
    currentCommands(_context, { phase, binding }) {
      if (material === undefined) throw new Error('A seed has no current before its plan')
      const { basis, standing, sources } = material
      return phase === 'ready'
        ? [
            {
              participant: SETTINGS_SEED_READY,
              facts: { current: z.json().parse({ binding, basis, standing, sources }) },
            },
          ]
        : [
            {
              participant: SETTINGS_SEED_COMMIT,
              facts: {
                current: z.json().parse({ binding, observation: { kind: 'available', material } }),
              },
            },
          ]
    },
  }
}
