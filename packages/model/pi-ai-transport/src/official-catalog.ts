import type { ProviderName } from '@omne-harness-lite/model-profile'
import { createOfficialProfileContent, type OfficialProfileContentResult } from './configuration.ts'
import type { CacheDeclaration, CachePolicy, ModelDefinition } from './definitions.ts'
import type { InputMeter } from './input-meter.ts'
import { createAnthropicInputMeter } from './input-meters/anthropic.ts'
import { createDeepSeekV41FlashInputMeter } from './input-meters/deepseek-v41-flash.ts'
import { createDeepSeekV4ProInputMeter } from './input-meters/deepseek-v4-pro.ts'
import { createGoogleInputMeter } from './input-meters/google.ts'
import { createMoonshotInputMeter } from './input-meters/moonshot.ts'
import { createOpenAiInputMeter } from './input-meters/openai.ts'
import { createQwenInputMeter } from './input-meters/qwen.ts'
import { createXaiInputMeter } from './input-meters/xai.ts'
import { createZaiCommercialInputMeter } from './input-meters/zai-commercial.ts'
import { createGlm52InputMeter } from './input-meters/zai-glm52.ts'
import { createGlm53InputMeter } from './input-meters/zai-glm53.ts'
import { officialModelIds } from './official.ts'
import { anthropicDefinitions } from './official-models/anthropic.ts'
import {
  deepseekDefinitions,
  deepseekV41FlashDefinition,
  deepseekV4Pro0813Definition,
} from './official-models/deepseek.ts'
import { googleDefinitions } from './official-models/google.ts'
import { moonshotDefinitions } from './official-models/moonshot.ts'
import { openaiDefinitions } from './official-models/openai.ts'
import { qwenDefinitions } from './official-models/qwen.ts'
import { xaiDefinitions } from './official-models/xai.ts'
import { zaiDefinitions } from './official-models/zai.ts'

export type OfficialFamily =
  'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'qwen' | 'moonshot' | 'zai'

/** Builds the one exact meter for a supported definition; unsupported input throws. */
export type OfficialInputMeterFactory = (definition: ModelDefinition) => InputMeter

/** One official leaf: its definition, its only route, meter factory and derived cache setting. */
export interface OfficialCatalogEntry {
  readonly family: OfficialFamily
  readonly definition: ModelDefinition
  /** The single route key the definition pins; a leaf never carries a provider fallback. */
  readonly provider: ProviderName
  readonly createInputMeter: OfficialInputMeterFactory
  /** Exported name of the package factory bound to this leaf, e.g. `createGlm53InputMeter`. */
  readonly inputMeterFactory: string
  /**
   * Initial cache configuration read from the route declaration: `automatic` stays automatic,
   * `explicit` takes the first declared TTL and the first declared breakpoint layout. A caller
   * wanting another declared value builds its own configuration with
   * `createOfficialProfileContent`.
   */
  readonly cache: CachePolicy
}

/**
 * Publication revision of the catalog. Raise it by one whenever the catalog changes — a leaf
 * added or removed, a definition or implementation coordinate, a meter algorithm or a factory
 * binding — and record the new fingerprint in `tests/fixtures/official-catalog/fingerprint.json`.
 * Consumers that publish a directory manifest derive their ordinal from it.
 */
export const officialCatalogRevision = 1

interface MeterBinding {
  readonly name: string
  readonly create: OfficialInputMeterFactory
}

function bind(factory: (definition: ModelDefinition) => InputMeter | undefined): MeterBinding {
  return {
    name: factory.name,
    create: definition => {
      const meter = factory(definition)
      if (meter === undefined)
        throw new TypeError(`no input meter for official model ${definition.modelId}`)
      return meter
    },
  }
}

// The one place that binds each official leaf to its meter factory. Families whose leaves need
// different factories list every leaf; a leaf they do not list fails at module load below, not
// when a consumer first asks for a meter.
const leafBindings = (bindings: Readonly<Record<string, MeterBinding>>) => (modelId: string) =>
  Object.hasOwn(bindings, modelId) ? bindings[modelId] : undefined
const families: Readonly<
  Record<
    OfficialFamily,
    {
      readonly definitions: readonly ModelDefinition[]
      readonly meter: (modelId: string) => MeterBinding | undefined
    }
  >
> = {
  openai: { definitions: openaiDefinitions, meter: () => bind(createOpenAiInputMeter) },
  anthropic: { definitions: anthropicDefinitions, meter: () => bind(createAnthropicInputMeter) },
  google: { definitions: googleDefinitions, meter: () => bind(createGoogleInputMeter) },
  deepseek: {
    definitions: deepseekDefinitions,
    meter: leafBindings({
      [deepseekV4Pro0813Definition.modelId]: bind(createDeepSeekV4ProInputMeter),
      [deepseekV41FlashDefinition.modelId]: bind(createDeepSeekV41FlashInputMeter),
    }),
  },
  xai: { definitions: xaiDefinitions, meter: () => bind(createXaiInputMeter) },
  qwen: { definitions: qwenDefinitions, meter: () => bind(createQwenInputMeter) },
  moonshot: { definitions: moonshotDefinitions, meter: () => bind(createMoonshotInputMeter) },
  zai: {
    definitions: zaiDefinitions,
    meter: leafBindings({
      'z-ai/glm-5.2': bind(createGlm52InputMeter),
      'z-ai/glm-5.3': bind(createGlm53InputMeter),
      'z-ai/glm-5.3-flash': bind(createGlm53InputMeter),
      'z-ai/glm-5.3-prime': bind(createZaiCommercialInputMeter),
      'z-ai/glm-5.3-flashx': bind(createZaiCommercialInputMeter),
    }),
  },
}

/** Pure derivation of the initial cache configuration from one route declaration. */
function initialCachePolicy(declaration: CacheDeclaration): CachePolicy {
  if (declaration.mode === 'automatic') return Object.freeze({ mode: 'automatic' })
  const [ttl] = declaration.ttlValues
  const [breakpoints] = declaration.breakpointLayouts
  if (ttl === undefined || breakpoints === undefined)
    throw new TypeError('explicit cache declaration lists no TTL or breakpoint layout')
  return Object.freeze({ mode: 'explicit', ttl, breakpoints })
}

function catalogEntry(family: OfficialFamily, definition: ModelDefinition): OfficialCatalogEntry {
  const routes = Object.entries(definition.routes)
  const [only] = routes
  if (routes.length !== 1 || only === undefined)
    throw new TypeError(`official model ${definition.modelId} must pin exactly one route`)
  const [provider, route] = only
  const binding = families[family].meter(definition.modelId)
  if (binding === undefined)
    throw new TypeError(`official model ${definition.modelId} has no input meter binding`)
  return Object.freeze({
    family,
    definition,
    provider,
    createInputMeter: binding.create,
    inputMeterFactory: binding.name,
    cache: initialCachePolicy(route.cache),
  })
}

/**
 * Every official leaf, in family order. Loading fails if its identities differ from
 * `officialModelIds`, so a leaf added without a catalog binding cannot be skipped silently.
 * Meter construction is left to the consumer; the catalog itself holds no meters.
 */
export const officialCatalog: readonly OfficialCatalogEntry[] = Object.freeze(
  (Object.keys(families) as OfficialFamily[]).flatMap(family =>
    families[family].definitions.map(definition => catalogEntry(family, definition)),
  ),
)
{
  const catalogIds = officialCatalog.map(entry => entry.definition.modelId)
  const expected = [...officialModelIds].sort()
  const actual = [...catalogIds].sort()
  if (
    new Set(catalogIds).size !== catalogIds.length ||
    actual.length !== expected.length ||
    actual.some((modelId, index) => modelId !== expected[index])
  )
    throw new Error('official catalog differs from officialModelIds')
}

/** Official profile content for one catalog entry: its only route, no fallback, derived cache. */
export function createOfficialCatalogProfile(
  entry: OfficialCatalogEntry,
  configurationRevision: string,
): OfficialProfileContentResult {
  return createOfficialProfileContent(entry.definition, {
    providers: [entry.provider],
    allowFallback: false,
    configuration: { revision: configurationRevision, values: { cache: entry.cache } },
  })
}
