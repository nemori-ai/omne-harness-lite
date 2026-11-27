import {
  supportedReasoningEfforts,
  type ModelProfileDefinition,
  type ProviderName,
} from '@omne-harness/model-contract'
import type { CatalogModel } from '@omne-harness/model-contract/provider-asset'
import { officialProfiles } from './official-profiles.ts'

// The catalog reads only facts the family records hold; this input reaches no field it reads.
const CATALOG_INPUT = {
  retryPolicy: {
    owner: 'model-host-local',
    name: 'catalog',
    revision: '1',
    digest: '0'.repeat(64),
  },
  compactionTriggerPercent: '80',
} as const

function catalogModel(definition: ModelProfileDefinition, enabled: boolean): CatalogModel {
  const [supplier] = definition.suppliers
  const common = {
    model: supplier.model,
    title: supplier.model,
    input: definition.input,
    output: definition.output,
    enabled,
  }
  switch (definition.kind) {
    case 'llm':
      return {
        ...common,
        kind: 'llm',
        window: definition.context.window.provided,
        efforts: supportedReasoningEfforts(definition),
      }
    case 'decisions':
      return {
        ...common,
        kind: 'decisions',
        ...(definition.maxQuestions === null ? {} : { maxQuestions: definition.maxQuestions }),
      }
    default: {
      const _exhaustive: never = definition
      return _exhaustive
    }
  }
}

/** The models of the official profiles that go through the provider, in release order. */
export function officialCatalog(
  provider: ProviderName,
  enabled: (model: string) => boolean,
): readonly CatalogModel[] {
  return officialProfiles(CATALOG_INPUT)
    .filter(definition => definition.suppliers[0].provider === provider)
    .map(definition => catalogModel(definition, enabled(definition.suppliers[0].model)))
}

/** Every provider an official profile goes through: the release must hold each of them. */
export function officialSupplierProviders(): readonly ProviderName[] {
  return [
    ...new Set(officialProfiles(CATALOG_INPUT).map(definition => definition.suppliers[0].provider)),
  ]
}
