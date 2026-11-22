import { createHash } from 'node:crypto'
import { readBodyText } from '@omne-harness/assets'
import {
  modelProviderBodyContract,
  parseModelProviderBody,
  type ModelProviderBody,
} from '@omne-harness/model-contract/provider-asset'
import type { ProviderName } from '@omne-harness/model-contract'
import type { CredentialProviderSource } from '@omne-harness/model-host-local'
import {
  isEngineEndpoint,
  type EngineEndpoint,
  type PiRoute,
  type PiRouteEndpoint,
} from '@omne-harness/pi-ai-transport'
import { OPENROUTER_PROVIDER_BODY_TEXT } from '@omne-harness/pi-ai-transport/chat-completions'
import type { SecretBindingKey, SecretScope, SettingsHolding } from '@omne-harness/settings'
import { holdingKey, officialHolding, type OfficialHolding } from './official-holdings.ts'

const RELEASE_PROVIDER_TEXTS: readonly string[] = [OPENROUTER_PROVIDER_BODY_TEXT]
const PROVIDER_CONTRACT = modelProviderBodyContract()

const BODY_LIMITS = {
  maxBytes: 16_384,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 2048,
  maxNumberLength: 20,
}

export type ReleaseProvider = Readonly<{
  body: ModelProviderBody
  version: string
  holding: Extract<OfficialHolding, { kind: 'declared' }> | null
}>

function readProvider(text: string): ReleaseProvider {
  const read = readBodyText(text, BODY_LIMITS)
  if (read.kind !== 'ok') throw new Error(`a release provider body is not a document: ${read.kind}`)
  const parsed = parseModelProviderBody(read.value)
  if ('failure' in parsed) throw new Error(`a release provider body is refused: ${parsed.failure}`)
  const body = parsed.ok
  const version = createHash('sha256').update(text, 'utf8').digest('hex')
  const held = officialHolding({
    contract: PROVIDER_CONTRACT,
    name: body.name,
    version,
    body: read.value,
  })
  if (held.kind === 'rejected')
    throw new Error(`the provider ${body.name} declares no valid settings: ${held.reason}`)
  return { body, version, holding: held.kind === 'declared' ? held : null }
}

let providers: readonly ReleaseProvider[] | undefined

export function releaseProviders(): readonly ReleaseProvider[] {
  providers ??= Object.freeze(RELEASE_PROVIDER_TEXTS.map(readProvider))
  return providers
}

export function releaseProvider(name: string): ReleaseProvider | undefined {
  return releaseProviders().find(provider => provider.body.name === name)
}

function holdingOf(provider: ReleaseProvider): SettingsHolding {
  if (provider.holding === null)
    throw new Error(`the provider ${provider.body.name} declares no credential item`)
  return provider.holding.ref.holding
}

export function providerCredentialKey(
  provider: ReleaseProvider,
  scope: SecretScope,
  item: string,
): SecretBindingKey {
  return holdingKey(scope, holdingOf(provider), item)
}

export function credentialProviders(): ReadonlyMap<ProviderName, CredentialProviderSource> {
  return new Map(
    releaseProviders().map(provider => [
      provider.body.name,
      {
        items: provider.body.credentials.map(credential => credential.item),
        official: true,
        keyOf: (scope: SecretScope, item: string) => providerCredentialKey(provider, scope, item),
      },
    ]),
  )
}

// An operator address replaces the address of every endpoint of the provider.
function routeOf(provider: ReleaseProvider, url: string | undefined): PiRoute {
  const { body } = provider
  const endpoints: Partial<Record<EngineEndpoint, PiRouteEndpoint>> = {}
  for (const endpoint of body.endpoints) {
    if (!isEngineEndpoint(endpoint.protocol))
      throw new Error(
        `the provider ${body.name} speaks ${endpoint.protocol}, which this release cannot send`,
      )
    endpoints[endpoint.protocol] = {
      url: url ?? endpoint.url,
      endMarker: endpoint.endMarker ?? null,
    }
  }
  if (body.credentials.length > 1)
    throw new Error(`the provider ${body.name} declares several credential items and no bearer`)
  const [credential] = body.credentials
  return {
    endpoints,
    accounting: body.accounting,
    auth: credential === undefined ? null : { kind: 'bearer', item: credential.item },
  }
}

export function providerRoutes(
  endpoints: Readonly<Record<string, string>>,
): Readonly<Record<string, PiRoute>> {
  for (const name of Object.keys(endpoints))
    if (releaseProvider(name) === undefined)
      throw new Error(`an endpoint names ${name}, which the release does not hold`)
  return Object.fromEntries(
    releaseProviders().map(provider => [
      provider.body.name,
      routeOf(provider, endpoints[provider.body.name]),
    ]),
  )
}
