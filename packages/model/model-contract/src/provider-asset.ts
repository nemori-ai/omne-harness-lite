import {
  digestBytes,
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
import type { ModelModality } from './profile.ts'
import { REASONING_EFFORTS, type ProviderName, type ReasoningEffort } from './root.ts'

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

/** One model of the provider model catalog: what the provider adapts, and whether the release enables it. */
type CatalogCommon = Readonly<{
  model: string
  title: string
  input: readonly ModelModality[]
  output: readonly ModelModality[]
  enabled: boolean
}>
export type LlmCatalog = Readonly<{
  kind: 'llm'
  window: string
  efforts: readonly ReasoningEffort[]
}>
export type DecisionsCatalog = Readonly<{ kind: 'decisions'; maxQuestions?: string }>
export type LiveCatalog = Readonly<{ kind: 'live'; maxSessionSeconds?: string }>
export type CatalogModel = CatalogCommon & (LlmCatalog | DecisionsCatalog | LiveCatalog)
export type CatalogKind = CatalogModel['kind']

export const CATALOG_KINDS = ['llm', 'decisions', 'live'] as const satisfies readonly CatalogKind[]

export type ProviderAccounting = Readonly<{
  place: string
  costUnit: string
  generation?: Readonly<{ requestHeader: string; path: string }>
}>

export type ModelProviderBody = Readonly<{
  name: ProviderName
  endpoints: readonly ModelProviderEndpoint[]
  accounting: ProviderAccounting
  credentials: readonly CredentialItemDeclaration[]
  models: readonly CatalogModel[]
}>

/** What a tenant chose over a catalog: the models of each kind that are on, and the default effort of some chat models. */
export type ProviderPreferences = Readonly<{
  enabled: Readonly<Record<CatalogKind, ReadonlySet<string>>>
  efforts: ReadonlyMap<string, ReasoningEffort>
}>

/** The two settings of a tenant: on or off, and the default reasoning effort, per catalog model. */
export const MODEL_SWITCHES = 'model-switches'
export const MODEL_REASONING_EFFORTS = 'model-reasoning-efforts'

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
  | 'invalid-models'

const CREDENTIAL_ITEM = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/u
const HEADER_NAME = /^[a-z][a-z0-9-]{0,63}$/u
const CREDENTIALS_GROUP = 'credentials'
const SETTINGS_PROVIDER_ID = MODEL_PROVIDER_CATEGORY

const schemaRead = readBodyText(
  '{"kind":"model-provider-body","properties":{"name":"string","endpoints":[{"protocol":"string","url":"string","endMarker":"string"}],"accounting":{"place":"string","costUnit":"string","generation":{"requestHeader":"string","path":"string"}},"credentials":[{"item":"string","title":"string","description":"string","impact":"string","clear":"string"}],"models":[{"kind":"string","model":"string","title":"string","input":["string"],"output":["string"],"window":"string","efforts":["string"],"maxQuestions":"string","enabled":"boolean"}]}}',
  {
    maxBytes: 2000,
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
  const models = modelsOf(field(body, 'models'))
  if (models === undefined) return fail('invalid-models')
  return succeed({ name, endpoints, accounting, credentials, models })
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
      return preferencesAndCredentials(typed(body, context?.capabilityName))
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
  if (place === undefined || place === '' || costUnit === undefined || costUnit === '')
    return undefined
  const stated = field(value, 'generation')
  if (stated === undefined) return { place, costUnit }
  const generation = generationOf(stated)
  return generation === undefined ? undefined : { place, costUnit, generation }
}

function generationOf(value: JsonValue): ProviderAccounting['generation'] {
  const requestHeader = stringField(value, 'requestHeader')
  const path = stringField(value, 'path')
  return requestHeader === undefined ||
    !HEADER_NAME.test(requestHeader) ||
    path === undefined ||
    !path.startsWith('/')
    ? undefined
    : { requestHeader, path }
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

const PREFERENCES_GROUP = 'models'

const PREFERENCE_ITEMS = [
  {
    id: MODEL_SWITCHES,
    groupId: PREFERENCES_GROUP,
    category: 'preference' as const,
    presentation: {
      title: '启用的模型',
      description: '这家供应商的每个模型按模型类型开或关；没有设的按发行缺省。',
      impact: '之后的模型列表与请求按新的开关；正在跑的调用不受影响。',
      clear: '清除之后每个模型回到发行缺省。',
      adoption: 'next-read' as const,
    },
    valueSchema: {
      type: 'object',
      properties: {
        llm: { type: 'object', additionalProperties: { type: 'boolean' } },
        decisions: { type: 'object', additionalProperties: { type: 'boolean' } },
        live: { type: 'object', additionalProperties: { type: 'boolean' } },
      } satisfies Record<CatalogKind, unknown>,
      additionalProperties: false,
    },
    default: { kind: 'absent' as const },
    merge: 'override' as const,
    sensitivity: 'ordinary' as const,
  },
  {
    id: MODEL_REASONING_EFFORTS,
    groupId: PREFERENCES_GROUP,
    category: 'preference' as const,
    presentation: {
      title: '模型的缺省推理强度',
      description: '会话没有另选推理强度时，每个模型用这里定的一档。',
      impact: '之后的请求按新的缺省推理强度；已经发出的不变。',
      clear: '清除之后每个模型回到供应商默认。',
      adoption: 'next-read' as const,
    },
    valueSchema: { type: 'object', additionalProperties: { enum: [...REASONING_EFFORTS] } },
    default: { kind: 'absent' as const },
    merge: 'override' as const,
    sensitivity: 'ordinary' as const,
  },
]

function preferencesAndCredentials(provider: ModelProviderBody) {
  const groups = [
    {
      id: PREFERENCES_GROUP,
      parentId: null,
      title: '模型',
      description: `模型供应商 ${provider.name} 的模型开关与缺省推理强度。`,
      order: 0,
    },
    ...(provider.credentials.length === 0
      ? []
      : [
          {
            id: CREDENTIALS_GROUP,
            parentId: null,
            title: '凭据',
            description: `模型供应商 ${provider.name} 要的凭据。`,
            order: 1,
          },
        ]),
  ]
  const items = [
    ...PREFERENCE_ITEMS,
    ...provider.credentials.map(credential => ({
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
  ]
  // The version follows the declaration alone, so a catalog that changes leaves stored values valid.
  const version = digestBytes(new TextEncoder().encode(JSON.stringify({ groups, items })))
  return { providerId: SETTINGS_PROVIDER_ID, definitionId: provider.name, version, groups, items }
}

const WINDOW = /^[1-9][0-9]{0,15}$/u
const MODEL_MODALITIES: ReadonlySet<string> = new Set(['text', 'image', 'voice'])

function textsOf(value: JsonValue | undefined): string[] | undefined {
  if (value?.kind !== 'array') return undefined
  const out: string[] = []
  for (const item of value.items) {
    if (item.kind !== 'string') return undefined
    out.push(item.value)
  }
  return out
}

const isModelModality = (text: string): text is ModelModality => MODEL_MODALITIES.has(text)

function modalitiesOf(value: JsonValue | undefined): ModelModality[] | undefined {
  const texts = textsOf(value)
  if (texts === undefined || texts.length === 0) return undefined
  const modalities = texts.filter(isModelModality)
  return modalities.length === texts.length ? modalities : undefined
}

function effortsOf(value: JsonValue | undefined): ReasoningEffort[] | undefined {
  const texts = textsOf(value)
  if (texts === undefined) return undefined
  const ordered = REASONING_EFFORTS.filter(effort => texts.includes(effort))
  return ordered.length === texts.length && ordered.every((effort, i) => texts[i] === effort)
    ? ordered
    : undefined
}

function llmCatalogOf(entry: JsonValue): LlmCatalog | undefined {
  const window = stringField(entry, 'window')
  const efforts = effortsOf(field(entry, 'efforts'))
  if (window === undefined || !WINDOW.test(window) || efforts === undefined) return undefined
  return { kind: 'llm', window, efforts }
}

function statedLimit(entry: JsonValue, name: string): { value?: string } | undefined {
  if (field(entry, name) === undefined) return {}
  const value = stringField(entry, name)
  return value !== undefined && WINDOW.test(value) ? { value } : undefined
}

function decisionsCatalogOf(entry: JsonValue): DecisionsCatalog | undefined {
  const limit = statedLimit(entry, 'maxQuestions')
  if (limit === undefined) return undefined
  return limit.value === undefined
    ? { kind: 'decisions' }
    : { kind: 'decisions', maxQuestions: limit.value }
}

function liveCatalogOf(entry: JsonValue): LiveCatalog | undefined {
  const limit = statedLimit(entry, 'maxSessionSeconds')
  if (limit === undefined) return undefined
  return limit.value === undefined
    ? { kind: 'live' }
    : { kind: 'live', maxSessionSeconds: limit.value }
}

function ownCatalogOf(entry: JsonValue): LlmCatalog | DecisionsCatalog | LiveCatalog | undefined {
  switch (stringField(entry, 'kind')) {
    case 'llm':
      return llmCatalogOf(entry)
    case 'decisions':
      return decisionsCatalogOf(entry)
    case 'live':
      return liveCatalogOf(entry)
  }
  return undefined
}

function catalogModelOf(entry: JsonValue): CatalogModel | undefined {
  const model = stringField(entry, 'model')
  const title = stringField(entry, 'title')
  const enabled = field(entry, 'enabled')
  const input = modalitiesOf(field(entry, 'input'))
  const output = modalitiesOf(field(entry, 'output'))
  const own = ownCatalogOf(entry)
  if (!model || !title || own === undefined) return undefined
  if (enabled?.kind !== 'boolean' || input === undefined || output === undefined) return undefined
  return { model, title, input, output, enabled: enabled.value, ...own }
}

function modelsOf(value: JsonValue | undefined): CatalogModel[] | undefined {
  if (value?.kind !== 'array') return undefined
  const out: CatalogModel[] = []
  for (const entry of value.items) {
    const model = catalogModelOf(entry)
    if (
      model === undefined ||
      out.some(other => other.kind === model.kind && other.model === model.model)
    )
      return undefined
    out.push(model)
  }
  return out
}

const entryOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, key)
    ? Reflect.get(value, key)
    : undefined

// Without a boolean switch a model keeps its release default; an unsupported effort or a key outside the catalog is ignored.
export function preferencesOf(
  body: ModelProviderBody,
  switches: unknown,
  efforts: unknown,
): ProviderPreferences {
  const enabled: Record<CatalogKind, Set<string>> = {
    llm: new Set(),
    decisions: new Set(),
    live: new Set(),
  }
  const chosen = new Map<string, ReasoningEffort>()
  for (const entry of body.models) {
    const on = entryOf(entryOf(switches, entry.kind), entry.model)
    if (typeof on === 'boolean' ? on : entry.enabled) enabled[entry.kind].add(entry.model)
    if (entry.kind !== 'llm') continue
    const effort = entryOf(efforts, entry.model)
    const supported = entry.efforts.find(level => level === effort)
    if (supported !== undefined) chosen.set(entry.model, supported)
  }
  return { enabled, efforts: chosen }
}
