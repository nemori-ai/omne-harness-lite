import {
  digestBytes,
  isReadBody,
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type CategoryDisplay,
  type JudgeContext,
  type Judgment,
} from '@omne-harness/assets'

export const mcpCategoryDisplay: CategoryDisplay = Object.freeze({
  title: 'MCP',
  summary: '按地址接入的 MCP 服务端，它的动作作为工具交给代理。',
  creation:
    '一份数据：名字、传输（streamable-http）与认证（none、static、oauth）；地址与密钥是建好之后这一份的设置。',
  authoring: [
    'An MCP endpoint is data, not a directory: publish with data {"name":"<the name it is published under>","transport":"streamable-http","auth":"none"}. auth is none, static (a key) or oauth.',
    'omne reaches a server only at an address. It does not read .mcp.json and does not start a command: a server that only runs as a local command (npx, uvx, stdio) cannot be added. Say so, and look for a hosted address of the same server.',
    'Then give it its address: configure with category mcp, the name, item target and value "https://.../mcp" (http only on 127.0.0.1 or localhost).',
    'auth static: the key is a secret, set by the person on the 资产 page, tab MCP, in the section of this endpoint (凭据). Tell them so; never ask for a key in the chat.',
    'auth oauth: the person clicks 连接 in that section and agrees in the browser. If the server wants an application registered first (GitHub does), the section says what to register and where its client identifier goes.',
    'Its actions are one tool, mcp__<name>, with a command for each action: find it with Tools search (query the name) and call it with Tools execute. The first call asks the person.',
  ].join('\n'),
})
import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { ENDPOINT_BODY_SCHEMA } from './endpoint-schema.ts'
import { hasOnly, isObject, member, textOf } from './json.ts'
import { isEndpointName } from './brands.ts'
import type { AuthKind, EndpointDefinition } from './values.ts'

export type EndpointBodyRejection =
  | 'malformed'
  | 'name-mismatch'
  | 'transport-unknown'
  | 'auth-unknown'

const BODY_MEMBERS = ['name', 'transport', 'auth'] as const
const AUTH_KINDS: readonly AuthKind[] = ['none', 'static', 'oauth']

function isAuthKind(value: string): value is AuthKind {
  return AUTH_KINDS.some(known => known === value)
}

export function parseEndpointBody(
  body: unknown,
  capabilityName?: string,
): Outcome<EndpointDefinition, EndpointBodyRejection> {
  const judged = judgeJsonValue(body)
  if ('rejected' in judged || !isObject(judged.ok) || !hasOnly(judged.ok, BODY_MEMBERS))
    return fail('malformed')
  const document = judged.ok
  const name = textOf(member(document, 'name'))
  const transport = textOf(member(document, 'transport'))
  const auth = textOf(member(document, 'auth'))
  if (!isEndpointName(name) || transport === undefined || auth === undefined)
    return fail('malformed')
  if (capabilityName !== undefined && name !== capabilityName) return fail('name-mismatch')
  if (transport !== 'streamable-http') return fail('transport-unknown')
  if (!isAuthKind(auth)) return fail('auth-unknown')
  return succeed({ name, transport: { kind: 'streamable-http' }, auth })
}

const TARGET = 'setting:placement-identity:target'
const CREDENTIAL = 'setting:placement-identity:credential'
const CLIENT_ID = 'setting:placement-identity:client-id'
const CLIENT_SECRET = 'setting:placement-identity:client-secret'
const CONNECT_TIMEOUT = 'setting:preference:connect-timeout'
/** The setting by which the holder opens the actions of an endpoint to programs. */
export const PROGRAM_CALLS_SETTING = 'program-calls'
const PROGRAM_CALLS = `setting:preference:${PROGRAM_CALLS_SETTING}`

// Static and OAuth share one set of items, so a body that changes between them keeps what was set.
const CREDENTIALED = [CREDENTIAL, CLIENT_ID, CLIENT_SECRET]
const AUTH_DECLARATIONS = { none: [], static: CREDENTIALED, oauth: CREDENTIALED } as const

function declarationsOf(definition: EndpointDefinition): readonly string[] {
  return [TARGET, ...AUTH_DECLARATIONS[definition.auth], CONNECT_TIMEOUT, PROGRAM_CALLS]
}

const SCHEMA_LIMITS = {
  maxBytes: 20_000,
  maxDepth: 16,
  maxItems: 1_000,
  maxMembers: 32,
  maxStringLength: 1_000,
  maxNumberLength: 20,
} as const

const schemaRead = readBodyText(ENDPOINT_BODY_SCHEMA, SCHEMA_LIMITS)
if (schemaRead.kind !== 'ok') throw new TypeError('the MCP endpoint body schema is not JSON')
const schema: JsonValue = schemaRead.value

function definitionOf(
  body: unknown,
  context?: JudgeContext,
): Outcome<EndpointDefinition, EndpointBodyRejection | 'incomplete-reference'> {
  if (!isReadBody(body)) return fail('incomplete-reference')
  return parseEndpointBody(readSnapshot(body), context?.capabilityName)
}

function judge(body: unknown, context?: JudgeContext): Judgment {
  const parsed = definitionOf(body, context)
  return 'failure' in parsed ? refusal(parsed.failure) : { ok: true }
}

function judgedDefinition(body: unknown, context?: JudgeContext): EndpointDefinition {
  const parsed = definitionOf(body, context)
  if ('failure' in parsed)
    throw new TypeError(`MCP endpoint body failed judgment: ${parsed.failure}`)
  return parsed.ok
}

/** The gates of the category: one for each endpoint, calling its actions. The assembly names it. */
export const mcpEndpointGates = Object.freeze({
  category: 'mcp',
  ownerId: 'mcp.endpoint-gates',
  gates: Object.freeze([
    Object.freeze({ id: 'invoke', title: '调用这个接入点的动作', default: 'ask' as const }),
  ]),
})

type EndpointSettingDefinitions = NonNullable<ReturnType<NonNullable<BodyContract['settings']>>>
type EndpointSettingItem = EndpointSettingDefinitions['items'][number]

const CONNECTION_GROUP = 'connection'
const USE_GROUP = 'use'
const NO_DEFAULT = { kind: 'absent' as const }

function settingItem(
  item: Pick<EndpointSettingItem, 'id' | 'category' | 'valueSchema' | 'sensitivity'> &
    Pick<EndpointSettingItem['presentation'], 'title' | 'description' | 'impact' | 'clear'> &
    Readonly<{ unit?: string }>,
): EndpointSettingItem {
  const { title, description, impact, clear, unit, ...rest } = item
  return {
    ...rest,
    groupId: CONNECTION_GROUP,
    presentation: {
      title,
      description,
      impact,
      clear,
      adoption: 'next-read',
      ...(unit === undefined ? {} : { unit }),
    },
    default: NO_DEFAULT,
    merge: 'override',
  }
}

const TARGET_ITEM = settingItem({
  id: 'target',
  category: 'placement-identity',
  title: '连接目标',
  description: '这个接入点的地址：https，或本机回环地址上的 http。',
  impact: '下一次连接按这个地址去连；没有设时连不上。',
  clear: '这一层不再提供地址。',
  valueSchema: { type: 'string', minLength: 1, maxLength: 2048 },
  sensitivity: 'ordinary',
})
const CREDENTIAL_ITEM = settingItem({
  id: 'credential',
  category: 'placement-identity',
  title: '凭据',
  description: '认证方式是 static 时，连接这个接入点出示的凭据；oauth 时不用它。',
  impact: '下一次连接带这份凭据；没有设时对端会拒绝。',
  clear: '这一层不再提供凭据。',
  valueSchema: { type: 'string', minLength: 1 },
  sensitivity: 'secret',
})
const CLIENT_ID_ITEM = settingItem({
  id: 'client-id',
  category: 'placement-identity',
  title: '客户端标识',
  description: '认证方式是 oauth 时，在对方授权服务器那里登记的应用的客户端标识；不填时自动登记。',
  impact: '下一次点「连接」时用这个标识；没有设时按对方支持的方式自动登记。',
  clear: '这一层不再提供客户端标识。',
  valueSchema: { type: 'string', minLength: 1, maxLength: 2048 },
  sensitivity: 'ordinary',
})
const CLIENT_SECRET_ITEM = settingItem({
  id: 'client-secret',
  category: 'placement-identity',
  title: '客户端密钥',
  description: '认证方式是 oauth 时，登记的应用带的客户端密钥；公开客户端不填。',
  impact: '换令牌与续期时用这份密钥向授权服务器证明身份。',
  clear: '这一层不再提供客户端密钥。',
  valueSchema: { type: 'string', minLength: 1 },
  sensitivity: 'secret',
})
const CONNECT_TIMEOUT_ITEM = settingItem({
  id: 'connect-timeout',
  category: 'preference',
  title: '连接超时',
  description: '建立连接最多等多久。',
  impact: '下一次连接等这么久；没有设时连不上。',
  clear: '这一层不再提供连接超时。',
  unit: '毫秒',
  valueSchema: { type: 'integer', minimum: 1 },
  sensitivity: 'ordinary',
})
const PROGRAM_CALLS_ITEM: EndpointSettingItem = {
  ...settingItem({
    id: PROGRAM_CALLS_SETTING,
    category: 'preference',
    title: '程序调用',
    description: '这个接入点的动作许不许被 agent 写的程序调用。',
    impact: '开启后，agent 写的程序可以直接调用这个接入点的动作；每次调用仍各自过放行判断。',
    clear: '这一层不再表态；各层都没有设时不许。',
    valueSchema: { type: 'boolean' },
    sensitivity: 'ordinary',
  }),
  groupId: USE_GROUP,
  default: { kind: 'value', value: false },
}

const CREDENTIALED_ITEMS = [CREDENTIAL_ITEM, CLIENT_ID_ITEM, CLIENT_SECRET_ITEM]
const AUTH_ITEMS = { none: [], static: CREDENTIALED_ITEMS, oauth: CREDENTIALED_ITEMS } as const

// The version is the digest of the content: a new body that keeps the same settings keeps the values set.
function settingsOf(definition: EndpointDefinition): EndpointSettingDefinitions {
  const content = settingsContentOf(definition)
  return { ...content, version: digestBytes(new TextEncoder().encode(JSON.stringify(content))) }
}

function settingsContentOf(
  definition: EndpointDefinition,
): Omit<EndpointSettingDefinitions, 'version'> {
  return {
    providerId: mcpEndpointGates.ownerId,
    definitionId: definition.name,
    groups: [
      {
        id: CONNECTION_GROUP,
        parentId: null,
        title: '连接',
        description: `怎样连到接入点 ${definition.name}。`,
        order: 0,
      },
      {
        id: USE_GROUP,
        parentId: null,
        title: '使用',
        description: `agent 可以怎样用接入点 ${definition.name} 的动作。`,
        order: 1,
      },
    ],
    items: [TARGET_ITEM, ...AUTH_ITEMS[definition.auth], CONNECT_TIMEOUT_ITEM, PROGRAM_CALLS_ITEM],
  }
}

export function mcpEndpointBodyContract(): BodyContract {
  return {
    category: 'mcp',
    schema,
    judge,
    deriveDeclarations(body, context) {
      return { entries: declarationsOf(judgedDefinition(body, context)) }
    },
    settings(body, context) {
      return settingsOf(judgedDefinition(body, context))
    },
    references(body, context) {
      judgedDefinition(body, context)
      return []
    },
  }
}
