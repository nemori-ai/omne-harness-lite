import {
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
const CONNECT_TIMEOUT = 'setting:preference:connect-timeout'
/** The setting by which the holder opens the actions of an endpoint to programs. */
export const PROGRAM_CALLS_SETTING = 'program-calls'
const PROGRAM_CALLS = `setting:preference:${PROGRAM_CALLS_SETTING}`

function declarationsOf(definition: EndpointDefinition): readonly string[] {
  const credential = definition.auth === 'none' ? [] : [CREDENTIAL]
  return [TARGET, ...credential, CONNECT_TIMEOUT, PROGRAM_CALLS]
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
const UNPINNED_VERSION = 'unpinned'
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
  description: '连接这个接入点时出示的凭据。',
  impact: '下一次连接带这份凭据；没有设时对端会拒绝。',
  clear: '这一层不再提供凭据。',
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

function settingsOf(definition: EndpointDefinition, version: string): EndpointSettingDefinitions {
  return {
    providerId: mcpEndpointGates.ownerId,
    definitionId: definition.name,
    version,
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
    items: [
      TARGET_ITEM,
      ...(definition.auth === 'none' ? [] : [CREDENTIAL_ITEM]),
      CONNECT_TIMEOUT_ITEM,
      PROGRAM_CALLS_ITEM,
    ],
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
      return settingsOf(judgedDefinition(body, context), context?.definition ?? UNPINNED_VERSION)
    },
    references(body, context) {
      judgedDefinition(body, context)
      return []
    },
  }
}
