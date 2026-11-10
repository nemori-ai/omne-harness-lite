// The model provider asset (model design「凭据的范围」): the category `model-provider` of the asset
// domain. A model provider is the upstream service a model request really reaches. Its body says
// which protocol it speaks, where its endpoint is, how it accounts for cost and which credential
// items it needs; each credential item is a secret setting the provider declares, so the
// credentials of a provider are configured through the common asset settings. The body contract
// judges a body, and its `settings` hook derives one secret setting item per credential item.
import {
  isReadBody,
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { mintIdentity } from './mint.ts'
import type { ProviderName } from './root.ts'

/** The asset category of a model provider. */
export const MODEL_PROVIDER_CATEGORY = 'model-provider'

/** One credential item a provider needs: the secret setting it declares, and how it reads. */
export type CredentialItemDeclaration = Readonly<{
  item: string
  title: string
  description: string
  impact: string
  clear: string
}>

/** The judged body of a model provider asset. */
export type ModelProviderBody = Readonly<{
  name: ProviderName
  protocol: string
  endpoint: Readonly<{ url: string; endMarker?: string }>
  accounting: Readonly<{ place: string; costUnit: string }>
  credentials: readonly CredentialItemDeclaration[]
}>

/** Why a body is not a model provider body. */
export type ModelProviderBodyRejection =
  | 'not-an-object'
  | 'invalid-name'
  | 'name-mismatch'
  | 'invalid-protocol'
  | 'invalid-endpoint'
  | 'invalid-accounting'
  | 'invalid-credentials'
  | 'duplicate-credential'

/** A provider name: lowercase letters, digits, `.` and `-`, starting with a letter or a digit. */
const PROVIDER_NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/u
/** A credential item name: a letter, then letters and digits. */
const CREDENTIAL_ITEM = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/u
/** The one group every derived credential setting sits in. */
const CREDENTIALS_GROUP = 'credentials'
/** The provider id of every derived definition; the definition id is the provider name. */
const SETTINGS_PROVIDER_ID = MODEL_PROVIDER_CATEGORY
/** The version of a definition derived without a pinned version. */
const UNPINNED_VERSION = '0'

const schemaRead = readBodyText(
  '{"kind":"model-provider-body","properties":{"name":"string","protocol":"string","endpoint":{"url":"string","endMarker":"string"},"accounting":{"place":"string","costUnit":"string"},"credentials":[{"item":"string","title":"string","description":"string","impact":"string","clear":"string"}]}}',
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('model provider schema text is not a document')
const schema: JsonValue = schemaRead.value

/** The text of a provider name, or a rejection. The one boundary that mints a `ProviderName`. */
export function decodeProviderName(value: unknown): Outcome<ProviderName, 'invalid-name'> {
  return typeof value === 'string' && PROVIDER_NAME.test(value)
    ? succeed(mintIdentity<'ModelProviderName'>(value))
    : fail('invalid-name')
}

/** Judges a body against the provider rules and returns it in its typed form. */
export function parseModelProviderBody(
  body: unknown,
  capabilityName?: string,
): Outcome<ModelProviderBody, ModelProviderBodyRejection> {
  if (!isObject(body)) return fail('not-an-object')
  const decoded = decodeProviderName(stringField(body, 'name'))
  if (!('ok' in decoded)) return fail('invalid-name')
  const name = decoded.ok
  if (capabilityName !== undefined && name !== capabilityName) return fail('name-mismatch')
  const protocol = stringField(body, 'protocol')
  if (protocol === undefined || protocol === '') return fail('invalid-protocol')
  const endpoint = endpointOf(field(body, 'endpoint'))
  if (endpoint === undefined) return fail('invalid-endpoint')
  const accounting = accountingOf(field(body, 'accounting'))
  if (accounting === undefined) return fail('invalid-accounting')
  const credentials = credentialsOf(field(body, 'credentials'))
  if (credentials === 'invalid') return fail('invalid-credentials')
  if (new Set(credentials.map(entry => entry.item)).size !== credentials.length)
    return fail('duplicate-credential')
  return succeed({ name, protocol, endpoint, accounting, credentials })
}

/** The typed body, or `undefined` when the body is not a model provider body. */
export function readModelProviderBody(body: unknown): ModelProviderBody | undefined {
  const parsed = parseModelProviderBody(body)
  return 'ok' in parsed ? parsed.ok : undefined
}

/** The body contract of the category `model-provider`, for the category registry. */
export function modelProviderBodyContract(): BodyContract {
  return {
    category: MODEL_PROVIDER_CATEGORY,
    schema,
    judge,
    deriveDeclarations(body, context) {
      typed(body, context?.capabilityName)
      return { entries: [] }
    },
    settings(body, context) {
      const provider = typed(body, context?.capabilityName)
      if (provider.credentials.length === 0) return null
      return {
        providerId: SETTINGS_PROVIDER_ID,
        definitionId: provider.name,
        version: context?.definition ?? UNPINNED_VERSION,
        groups: [
          {
            id: CREDENTIALS_GROUP,
            parentId: null,
            title: 'Credentials',
            description: `The credentials the model provider ${provider.name} needs.`,
            order: 0,
          },
        ],
        items: provider.credentials.map(credential => ({
          id: credential.item,
          groupId: CREDENTIALS_GROUP,
          category: 'binding' as const,
          presentation: {
            title: credential.title,
            description: credential.description,
            impact: credential.impact,
            clear: credential.clear,
            adoption: 'next-read' as const,
          },
          valueSchema: { type: 'string' },
          default: { kind: 'absent' as const },
          merge: 'override' as const,
          sensitivity: 'secret' as const,
        })),
      }
    },
    references(body, context) {
      typed(body, context?.capabilityName)
      return []
    },
  }
}

function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  const parsed = parseModelProviderBody(body, context?.capabilityName)
  return 'ok' in parsed ? { ok: true } : refusal(parsed.failure)
}

/** The typed body for the hooks: the registry judges first, so a refusal here is a caller defect. */
function typed(body: unknown, capabilityName: string | undefined): ModelProviderBody {
  const parsed = parseModelProviderBody(body, capabilityName)
  if (!('ok' in parsed))
    throw new TypeError(`model provider body failed judgment: ${parsed.failure}`)
  return parsed.ok
}

function endpointOf(value: JsonValue | undefined): ModelProviderBody['endpoint'] | undefined {
  if (!isObject(value)) return undefined
  const url = stringField(value, 'url')
  if (url === undefined || !isHttpsUrl(url)) return undefined
  const marker = field(value, 'endMarker')
  if (marker === undefined) return { url }
  const endMarker = stringField(value, 'endMarker')
  return endMarker === undefined || endMarker === '' ? undefined : { url, endMarker }
}

function accountingOf(value: JsonValue | undefined): ModelProviderBody['accounting'] | undefined {
  if (!isObject(value)) return undefined
  const place = stringField(value, 'place')
  const costUnit = stringField(value, 'costUnit')
  return place === undefined || place === '' || costUnit === undefined || costUnit === ''
    ? undefined
    : { place, costUnit }
}

function credentialsOf(value: JsonValue | undefined): CredentialItemDeclaration[] | 'invalid' {
  const tree = readSnapshot(value)
  if (tree === undefined || tree.kind !== 'array') return 'invalid'
  const out: CredentialItemDeclaration[] = []
  for (const entry of tree.items) {
    const item = stringField(entry, 'item')
    const title = stringField(entry, 'title')
    const description = stringField(entry, 'description')
    const impact = stringField(entry, 'impact')
    const clear = stringField(entry, 'clear')
    if (
      item === undefined ||
      !CREDENTIAL_ITEM.test(item) ||
      !title ||
      !description ||
      !impact ||
      !clear
    )
      return 'invalid'
    out.push({ item, title, description, impact, clear })
  }
  return out
}

function isHttpsUrl(text: string): boolean {
  if (!URL.canParse(text)) return false
  const url = new URL(text)
  return url.protocol === 'https:' && url.username === '' && url.password === '' && url.hash === ''
}

function stringField(body: unknown, key: string): string | undefined {
  const value = field(body, key)
  return value?.kind === 'string' ? value.value : undefined
}

function field(body: unknown, key: string): JsonValue | undefined {
  const document = readSnapshot(body)
  if (document === undefined || document.kind !== 'object') return undefined
  return document.entries.find(entry => entry.key === key)?.value
}

function isObject(body: unknown): boolean {
  if (!isReadBody(body)) return false
  return readSnapshot(body)?.kind === 'object'
}
