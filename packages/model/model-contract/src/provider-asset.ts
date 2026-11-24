import {
  isReadBody,
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type CategoryDisplay,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeProviderName } from './provider-name.ts'
import type { ProviderName } from './root.ts'

export const MODEL_PROVIDER_CATEGORY = 'model-provider'

export const modelProviderCategoryDisplay: CategoryDisplay = Object.freeze({
  title: '模型供应商',
  summary: '一个模型服务的接入方式与它要的凭据。',
})

export type CredentialItemDeclaration = Readonly<{
  item: string
  title: string
  description: string
  impact: string
  clear: string
}>

/** One entry of the gateway: the interface it speaks there and its address. */
export type ModelProviderEndpoint = Readonly<{ protocol: string; url: string; endMarker?: string }>

export type ModelProviderBody = Readonly<{
  name: ProviderName
  endpoints: readonly ModelProviderEndpoint[]
  accounting: Readonly<{ place: string; costUnit: string }>
  credentials: readonly CredentialItemDeclaration[]
}>

export type ModelProviderBodyRejection =
  | 'not-an-object'
  | 'invalid-name'
  | 'name-mismatch'
  | 'invalid-endpoints'
  | 'invalid-protocol'
  | 'duplicate-protocol'
  | 'invalid-endpoint'
  | 'invalid-accounting'
  | 'invalid-credentials'
  | 'duplicate-credential'

const CREDENTIAL_ITEM = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/u
const CREDENTIALS_GROUP = 'credentials'
const SETTINGS_PROVIDER_ID = MODEL_PROVIDER_CATEGORY
const UNPINNED_VERSION = '0'

const schemaRead = readBodyText(
  '{"kind":"model-provider-body","properties":{"name":"string","endpoints":[{"protocol":"string","url":"string","endMarker":"string"}],"accounting":{"place":"string","costUnit":"string"},"credentials":[{"item":"string","title":"string","description":"string","impact":"string","clear":"string"}]}}',
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

export function parseModelProviderBody(
  body: unknown,
  capabilityName?: string,
): Outcome<ModelProviderBody, ModelProviderBodyRejection> {
  if (!isObject(body)) return fail('not-an-object')
  const decoded = decodeProviderName(stringField(body, 'name'))
  if (!('ok' in decoded)) return fail('invalid-name')
  const name = decoded.ok
  if (capabilityName !== undefined && name !== capabilityName) return fail('name-mismatch')
  const endpoints = endpointsOf(field(body, 'endpoints'))
  if (typeof endpoints === 'string') return fail(endpoints)
  const accounting = accountingOf(field(body, 'accounting'))
  if (accounting === undefined) return fail('invalid-accounting')
  const credentials = credentialsOf(field(body, 'credentials'))
  if (credentials === 'invalid') return fail('invalid-credentials')
  if (new Set(credentials.map(entry => entry.item)).size !== credentials.length)
    return fail('duplicate-credential')
  return succeed({ name, endpoints, accounting, credentials })
}

export function readModelProviderBody(body: unknown): ModelProviderBody | undefined {
  const parsed = parseModelProviderBody(body)
  return 'ok' in parsed ? parsed.ok : undefined
}

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
            title: '凭据',
            description: `模型供应商 ${provider.name} 要的凭据。`,
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

function typed(body: unknown, capabilityName: string | undefined): ModelProviderBody {
  const parsed = parseModelProviderBody(body, capabilityName)
  if (!('ok' in parsed))
    throw new TypeError(`model provider body failed judgment: ${parsed.failure}`)
  return parsed.ok
}

function endpointsOf(
  value: JsonValue | undefined,
):
  | readonly ModelProviderEndpoint[]
  | 'invalid-endpoints'
  | 'invalid-protocol'
  | 'duplicate-protocol'
  | 'invalid-endpoint' {
  const tree = readSnapshot(value)
  if (tree === undefined || tree.kind !== 'array' || tree.items.length === 0)
    return 'invalid-endpoints'
  const out: ModelProviderEndpoint[] = []
  for (const entry of tree.items) {
    if (!isObject(entry)) return 'invalid-endpoint'
    const protocol = stringField(entry, 'protocol')
    if (protocol === undefined || protocol === '') return 'invalid-protocol'
    if (out.some(item => item.protocol === protocol)) return 'duplicate-protocol'
    const url = stringField(entry, 'url')
    if (url === undefined || !isHttpsUrl(url)) return 'invalid-endpoint'
    if (field(entry, 'endMarker') === undefined) {
      out.push({ protocol, url })
      continue
    }
    const endMarker = stringField(entry, 'endMarker')
    if (endMarker === undefined || endMarker === '') return 'invalid-endpoint'
    out.push({ protocol, url, endMarker })
  }
  return out
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
