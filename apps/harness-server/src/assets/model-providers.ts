// The model providers the release holds (model design「凭据的范围」): fixed bodies of the category
// `model-provider`, read through the asset domain like every official asset. From one provider
// body the assembly derives three things, and nothing else names a provider:
// - its Settings holding: one secret setting item per credential item (`officialHolding`);
// - its credential source for the Model credential port: the items, and the binding key of an
//   item in a scope (`holdingKey`), so `omne setting set openrouter apiKey` and `setup` write the
//   very keys the send reads;
// - its route for the pi transport: endpoint, end marker, accounting, and a bearer of its one item.
// A second provider is one more body in `RELEASE_PROVIDER_TEXTS`.
import { createHash } from 'node:crypto'
import { readBodyText } from '@omne-harness/assets'
import {
  parseModelProviderBody,
  type ModelProviderBody,
} from '@omne-harness/model-contract/provider-asset'
import type { ProviderName } from '@omne-harness/model-contract'
import type { CredentialProviderSource } from '@omne-harness/model-host-local'
import type { PiRoute } from '@omne-harness/pi-ai-transport'
import { OPENROUTER_PROVIDER_BODY_TEXT } from '@omne-harness/pi-ai-transport/chat-completions'
import type { SecretBindingKey, SecretScope, SettingsHolding } from '@omne-harness/settings'
import { holdingKey, officialHolding, type OfficialHolding } from './official-holdings.ts'

/** The body documents of the providers this release holds. */
const RELEASE_PROVIDER_TEXTS: readonly string[] = [OPENROUTER_PROVIDER_BODY_TEXT]

/** The one protocol the send stage of this release speaks. */
const SENDABLE_PROTOCOL = 'chat-completions'

const BODY_LIMITS = {
  maxBytes: 16_384,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 2048,
  maxNumberLength: 20,
}

/** One provider of the release: its judged body and the Settings holding it declares. */
export type ReleaseProvider = Readonly<{
  body: ModelProviderBody
  /** `null` for a provider that declares no credential item. */
  holding: Extract<OfficialHolding, { kind: 'declared' }> | null
}>

function readProvider(text: string): ReleaseProvider {
  const read = readBodyText(text, BODY_LIMITS)
  if (read.kind !== 'ok') throw new Error(`a release provider body is not a document: ${read.kind}`)
  const parsed = parseModelProviderBody(read.value)
  if ('failure' in parsed) throw new Error(`a release provider body is refused: ${parsed.failure}`)
  const body = parsed.ok
  const held = officialHolding({
    category: 'model-provider',
    name: body.name,
    version: createHash('sha256').update(text, 'utf8').digest('hex'),
    body: read.value,
  })
  if (held.kind === 'rejected')
    throw new Error(`the provider ${body.name} declares no valid settings: ${held.reason}`)
  return { body, holding: held.kind === 'declared' ? held : null }
}

let providers: readonly ReleaseProvider[] | undefined

/** The providers of the release, read once. A release body that is refused is a release defect. */
export function releaseProviders(): readonly ReleaseProvider[] {
  providers ??= Object.freeze(RELEASE_PROVIDER_TEXTS.map(readProvider))
  return providers
}

/** The provider of the release with this name, or `undefined`. */
export function releaseProvider(name: string): ReleaseProvider | undefined {
  return releaseProviders().find(provider => provider.body.name === name)
}

function holdingOf(provider: ReleaseProvider): SettingsHolding {
  if (provider.holding === null)
    throw new Error(`the provider ${provider.body.name} declares no credential item`)
  return provider.holding.ref.holding
}

/** The binding key of one credential item of a release provider in one scope. */
export function providerCredentialKey(
  provider: ReleaseProvider,
  scope: SecretScope,
  item: string,
): SecretBindingKey {
  return holdingKey(scope, holdingOf(provider), item)
}

/** The credential sources of the Model credential port: every provider the release holds. */
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

/**
 * The route of one release provider. `url` replaces the endpoint of the body when the operator
 * sends to another gateway of the same protocol (a proxy or a test gateway). The request carries
 * the provider's one credential item as a bearer token; a provider with no item sends none.
 */
function routeOf(provider: ReleaseProvider, url: string | undefined): PiRoute {
  const { body } = provider
  if (body.protocol !== SENDABLE_PROTOCOL)
    throw new Error(
      `the provider ${body.name} speaks ${body.protocol}, which this release cannot send`,
    )
  if (body.credentials.length > 1)
    throw new Error(`the provider ${body.name} declares several credential items and no bearer`)
  const [credential] = body.credentials
  return {
    url: url ?? body.endpoint.url,
    endMarker: body.endpoint.endMarker ?? null,
    accounting: body.accounting,
    auth: credential === undefined ? null : { kind: 'bearer', item: credential.item },
  }
}

/** The routes of every release provider, with the operator's endpoint for a provider that has one. */
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
