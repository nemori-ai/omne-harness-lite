import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  validate,
  type ModelProfileContent,
  type ModelRequestParameters,
  type ModelAdaptationBinding,
  type ModelProfileRejection,
} from '@omne-harness-lite/model-profile'
import {
  tryDefinition,
  members,
  jsonEqual,
  type ModelDefinition,
  type DefinitionResult,
  type CachePolicy,
} from './definitions.ts'
import { object } from './json.ts'

export function configurationSchema(
  raw: ModelDefinition,
  provider: string,
): DefinitionResult<JsonObject> {
  const definition = tryDefinition(raw)
  if (!definition || !validate('ProviderName', provider).valid) return { rejected: 'invalidInput' }
  const route = Object.hasOwn(definition.routes, provider) ? definition.routes[provider] : undefined
  if (!route) return { rejected: 'unavailable' }
  const cache = route.cache
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['cache'],
    properties: {
      cache: {
        type: 'object',
        additionalProperties: false,
        required: cache.mode === 'automatic' ? ['mode'] : ['mode', 'ttl', 'breakpoints'],
        properties: {
          mode: { const: cache.mode },
          ...(cache.mode === 'explicit'
            ? {
                ttl: { type: 'string', enum: cache.ttlValues },
                breakpoints: { type: 'array', enum: cache.breakpointLayouts },
              }
            : {}),
        },
      },
    },
  }
  const owned = copyJsonValue(schema)
  if ('failed' in owned || !object(owned.ok))
    throw new Error('generated configuration Schema is not JSON')
  return { ok: owned.ok }
}

/** Schema and interpretation have exactly one allowed-value source: the owned route. */
export function interpretConfiguration(
  raw: ModelDefinition,
  values: JsonObject,
  provider: string,
): DefinitionResult<CachePolicy> {
  const definition = tryDefinition(raw)
  if (!definition || !validate('ProviderName', provider).valid) return { rejected: 'invalidInput' }
  const route = Object.hasOwn(definition.routes, provider) ? definition.routes[provider] : undefined
  if (!route) return { rejected: 'unavailable' }
  const copied = copyJsonValue(values)
  if (
    'failed' in copied ||
    !object(copied.ok) ||
    !members(copied.ok, ['cache']) ||
    !object(copied.ok.cache)
  )
    return { rejected: 'invalidInput' }
  const cache = copied.ok.cache
  if (route.cache.mode === 'automatic')
    return members(cache, ['mode']) && cache.mode === 'automatic'
      ? { ok: Object.freeze({ mode: 'automatic' }) }
      : { rejected: 'invalidInput' }
  if (
    !members(cache, ['mode', 'ttl', 'breakpoints']) ||
    cache.mode !== 'explicit' ||
    typeof cache.ttl !== 'string' ||
    !route.cache.ttlValues.includes(cache.ttl) ||
    !Array.isArray(cache.breakpoints)
  )
    return { rejected: 'invalidInput' }
  const breakpoints = cache.breakpoints
  const layout = route.cache.breakpointLayouts.find(value => jsonEqual(value, breakpoints))
  return layout
    ? { ok: Object.freeze({ mode: 'explicit', ttl: cache.ttl, breakpoints: layout }) }
    : { rejected: 'invalidInput' }
}

export interface OfficialProfileOptions {
  readonly providers: ModelProfileContent['providers']
  readonly allowFallback: boolean
  readonly configuration: ModelAdaptationBinding['configuration']
  readonly parameters?: ModelRequestParameters
}
export type OfficialProfileContentResult =
  | { readonly ok: ModelProfileContent }
  | { readonly rejected: ModelProfileRejection | 'invalidInput' }
function profileContent(value: unknown): value is ModelProfileContent {
  return 'ok' in judgeModelProfileDocument('ModelProfileContent', value)
}
/** Builds content only. Directory authority, registration and timestamps belong to the caller. */
export function createOfficialProfileContent(
  raw: ModelDefinition,
  options: OfficialProfileOptions,
): OfficialProfileContentResult {
  const definition = tryDefinition(raw),
    copied = copyJsonValue(options)
  if (
    !definition ||
    'failed' in copied ||
    !object(copied.ok) ||
    !Object.hasOwn(copied.ok, 'providers') ||
    !Object.hasOwn(copied.ok, 'allowFallback') ||
    !Object.hasOwn(copied.ok, 'configuration') ||
    Object.keys(copied.ok).some(
      key => !['providers', 'allowFallback', 'configuration', 'parameters'].includes(key),
    )
  )
    return { rejected: 'invalidInput' }
  const owned = copyJsonValue({
    ...definition.capabilities,
    routeName: definition.modelId,
    origin: 'official',
    providers: copied.ok.providers,
    allowFallback: copied.ok.allowFallback,
    adaptation: {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
      configuration: copied.ok.configuration,
    },
    ...(Object.hasOwn(copied.ok, 'parameters') ? { parameters: copied.ok.parameters } : {}),
  })
  if ('failed' in owned) return { rejected: 'malformed' }
  const judgment = judgeModelProfileDocument('ModelProfileContent', owned.ok)
  if ('rejected' in judgment) return judgment
  if (!profileContent(owned.ok)) throw new Error('core content judgment disagreed')
  const content = owned.ok
  if (
    content.providers.some(
      provider =>
        !(
          'ok' in
          interpretConfiguration(definition, content.adaptation.configuration.values, provider)
        ),
    )
  )
    return { rejected: 'invalidInput' }
  return { ok: content }
}
