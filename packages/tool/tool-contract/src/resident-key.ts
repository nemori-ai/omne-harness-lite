import type { JsonEntry, JsonValue } from '@omne-harness/json-text'
import {
  organizationCodec,
  tenantCodec,
  workspaceCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolBindingKey, ToolShape, ToolShapeParameters } from './authoring.ts'
import type { SourceLayer } from './definitions.ts'

export type ResidentKeyFailure = Readonly<{
  field: string
  reason: 'type' | 'empty' | 'identity'
}>

export type ResidentReferencesPage = Readonly<{
  sessions: readonly Readonly<{
    tenant: TenantId
    session: string
    capability: string
    shape: JsonValue
  }>[]
  next: string | null
}>

export type ResidentHolderPage = Readonly<{
  items: readonly Readonly<{ holder: string; tenant: TenantId; shape: ToolShape }>[]
  next: string | null
}>

const KEY_VERSION = 'rk1'

const refuse = (field: string, reason: ResidentKeyFailure['reason']) => fail({ field, reason })

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, field: string): Outcome<string, ResidentKeyFailure> {
  if (typeof value !== 'string') return refuse(field, 'type')
  if (value.length === 0) return refuse(field, 'empty')
  return succeed(value)
}

function layerId(layer: SourceLayer): Outcome<readonly [string, string], ResidentKeyFailure> {
  const input: unknown = layer
  if (!isRecord(input)) return refuse('layer', 'type')
  switch (layer.kind) {
    case 'official':
      return succeed(['official', ''])
    case 'organization': {
      const organization: unknown = layer.organization
      const value = isRecord(organization) ? organization['text'] : undefined
      const id = text(value, 'layer.organization')
      if ('failure' in id) return id
      if (!organizationCodec.parse(id.ok).ok) return refuse('layer.organization', 'identity')
      return succeed(['organization', id.ok])
    }
    case 'tenant': {
      const tenant: unknown = layer.tenant
      if (!isRecord(tenant)) return refuse('layer.tenant', 'type')
      const organization = tenant['organization']
      const account = tenant['account']
      const members = {
        organization: isRecord(organization) ? organization['text'] : undefined,
        account: isRecord(account) ? account['text'] : undefined,
      }
      if (typeof members.organization !== 'string' || typeof members.account !== 'string')
        return refuse('layer.tenant', 'type')
      const id = JSON.stringify(members)
      if (!tenantCodec.parse(id).ok) return refuse('layer.tenant', 'identity')
      return succeed(['tenant', id])
    }
    case 'workspace': {
      const encoded = workspaceCodec.encode(layer.workspace)
      if (!encoded.ok) return refuse('layer.workspace', 'identity')
      return succeed(['workspace', encoded.value])
    }
    default:
      return refuse('layer.kind', 'type')
  }
}

export function encodeResidentKey(key: ToolBindingKey): Outcome<string, ResidentKeyFailure> {
  const input: unknown = key
  if (!isRecord(input)) return refuse('key', 'type')
  const layer = layerId(key.layer)
  if ('failure' in layer) return layer
  const asset = input['asset']
  if (!isRecord(asset)) return refuse('asset', 'type')
  const adoption = asset['adoption']
  if (!isRecord(adoption)) return refuse('asset.adoption', 'type')
  const parts: string[] = [KEY_VERSION, ...layer.ok]
  const members: readonly (readonly [unknown, string])[] = [
    [asset['name'], 'asset.name'],
    [adoption['owner'], 'asset.adoption.owner'],
    [adoption['name'], 'asset.adoption.name'],
    [adoption['revision'], 'asset.adoption.revision'],
    [adoption['digest'], 'asset.adoption.digest'],
  ]
  for (const [value, field] of members) {
    const part = text(value, field)
    if ('failure' in part) return part
    parts.push(part.ok)
  }
  return succeed(JSON.stringify(parts))
}

const jsonText = (value: string): JsonValue => ({ kind: 'string', value })
const jsonObject = (entries: readonly (readonly [string, JsonValue])[]): JsonValue => ({
  kind: 'object',
  entries: entries.map(([key, value]): JsonEntry => ({ key, value })),
})

function parametersJson(parameters: ToolShapeParameters): JsonValue {
  if (parameters.kind === 'executor-owned')
    return jsonObject([['kind', jsonText('executor-owned')]])
  const { owner, name, digest } = parameters.vocabulary
  return jsonObject([
    ['kind', jsonText('declared')],
    ['schema', jsonText(parameters.schema)],
    [
      'vocabulary',
      jsonObject([
        ['owner', jsonText(owner)],
        ['name', jsonText(name)],
        ['digest', jsonText(digest)],
      ]),
    ],
  ])
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function shapeJson(shape: ToolShape): JsonValue {
  if (shape.kind === 'function')
    return jsonObject([
      ['name', jsonText(shape.name)],
      ['kind', jsonText('function')],
      ['parameters', parametersJson(shape.parameters)],
    ])
  const commands = [...shape.commands]
    .sort((left, right) => compareText(left.name, right.name))
    .map(command =>
      jsonObject([
        ['name', jsonText(command.name)],
        ['parameters', parametersJson(command.parameters)],
      ]),
    )
  return jsonObject([
    ['name', jsonText(shape.name)],
    ['kind', jsonText('commands')],
    ['commands', { kind: 'array', items: commands }],
  ])
}

function members<K extends string>(
  value: unknown,
  keys: readonly K[],
  field: string,
): Outcome<Readonly<Record<K, JsonValue>>, ResidentKeyFailure> {
  if (!isRecord(value) || value['kind'] !== 'object' || !Array.isArray(value['entries']))
    return refuse(field, 'type')
  const found = new Map<string, JsonValue>()
  for (const entry of value['entries'] as readonly unknown[]) {
    if (!isRecord(entry) || typeof entry['key'] !== 'string') return refuse(field, 'type')
    const key = entry['key']
    if (!(keys as readonly string[]).includes(key) || found.has(key))
      return refuse(`${field}.${key}`, 'type')
    found.set(key, entry['value'] as JsonValue)
  }
  for (const key of keys) if (!found.has(key)) return refuse(`${field}.${key}`, 'type')
  return succeed(Object.fromEntries(found) as Record<K, JsonValue>)
}

function jsonString(value: unknown, field: string): Outcome<string, ResidentKeyFailure> {
  if (!isRecord(value) || value['kind'] !== 'string') return refuse(field, 'type')
  return text(value['value'], field)
}

function kindOf(value: unknown, field: string): Outcome<string, ResidentKeyFailure> {
  if (!isRecord(value) || value['kind'] !== 'object' || !Array.isArray(value['entries']))
    return refuse(field, 'type')
  const entry = (value['entries'] as readonly unknown[]).find(
    item => isRecord(item) && item['key'] === 'kind',
  )
  return jsonString(isRecord(entry) ? entry['value'] : undefined, `${field}.kind`)
}

function readParameters(
  value: JsonValue,
  field: string,
): Outcome<ToolShapeParameters, ResidentKeyFailure> {
  const kind = kindOf(value, field)
  if ('failure' in kind) return kind
  if (kind.ok === 'executor-owned') {
    const read = members(value, ['kind'], field)
    if ('failure' in read) return read
    return succeed(Object.freeze({ kind: 'executor-owned' }))
  }
  if (kind.ok !== 'declared') return refuse(`${field}.kind`, 'type')
  const read = members(value, ['kind', 'schema', 'vocabulary'], field)
  if ('failure' in read) return read
  const schema = jsonString(read.ok.schema, `${field}.schema`)
  if ('failure' in schema) return schema
  const vocabulary = members(read.ok.vocabulary, ['owner', 'name', 'digest'], `${field}.vocabulary`)
  if ('failure' in vocabulary) return vocabulary
  const owner = jsonString(vocabulary.ok.owner, `${field}.vocabulary.owner`)
  if ('failure' in owner) return owner
  const name = jsonString(vocabulary.ok.name, `${field}.vocabulary.name`)
  if ('failure' in name) return name
  const digest = jsonString(vocabulary.ok.digest, `${field}.vocabulary.digest`)
  if ('failure' in digest) return digest
  return succeed(
    Object.freeze({
      kind: 'declared',
      schema: schema.ok,
      vocabulary: Object.freeze({ owner: owner.ok, name: name.ok, digest: digest.ok }),
    }),
  )
}

function readShape(value: unknown, field: string): Outcome<ToolShape, ResidentKeyFailure> {
  const kind = kindOf(value, field)
  if ('failure' in kind) return kind
  if (kind.ok === 'function') {
    const read = members(value, ['name', 'kind', 'parameters'], field)
    if ('failure' in read) return read
    const name = jsonString(read.ok.name, `${field}.name`)
    if ('failure' in name) return name
    const parameters = readParameters(read.ok.parameters, `${field}.parameters`)
    if ('failure' in parameters) return parameters
    return succeed(Object.freeze({ name: name.ok, kind: 'function', parameters: parameters.ok }))
  }
  if (kind.ok !== 'commands') return refuse(`${field}.kind`, 'type')
  const read = members(value, ['name', 'kind', 'commands'], field)
  if ('failure' in read) return read
  const name = jsonString(read.ok.name, `${field}.name`)
  if ('failure' in name) return name
  const list: unknown = read.ok.commands
  if (!isRecord(list) || list['kind'] !== 'array' || !Array.isArray(list['items']))
    return refuse(`${field}.commands`, 'type')
  const commands: Readonly<{ name: string; parameters: ToolShapeParameters }>[] = []
  for (const [index, item] of (list['items'] as readonly unknown[]).entries()) {
    const at = `${field}.commands[${index}]`
    const command = members(item, ['name', 'parameters'], at)
    if ('failure' in command) return command
    const commandName = jsonString(command.ok.name, `${at}.name`)
    if ('failure' in commandName) return commandName
    const parameters = readParameters(command.ok.parameters, `${at}.parameters`)
    if ('failure' in parameters) return parameters
    commands.push(Object.freeze({ name: commandName.ok, parameters: parameters.ok }))
  }
  return succeed(
    Object.freeze({ name: name.ok, kind: 'commands', commands: Object.freeze(commands) }),
  )
}

export function residentToolFacts(
  key: ToolBindingKey,
  shape: ToolShape,
): Outcome<Readonly<{ capability: string; key: string; shape: JsonValue }>, ResidentKeyFailure> {
  const encoded = encodeResidentKey(key)
  if ('failure' in encoded) return encoded
  const input: unknown = shape
  if (!isRecord(input)) return refuse('shape', 'type')
  let stored: JsonValue
  try {
    stored = shapeJson(shape)
  } catch {
    return refuse('shape', 'type')
  }
  const check = readShape(stored, 'shape')
  if ('failure' in check) return check
  return succeed(Object.freeze({ capability: key.asset.name, key: encoded.ok, shape: stored }))
}

export function projectResidentReferences(
  page: ResidentReferencesPage,
): Outcome<ResidentHolderPage, ResidentKeyFailure> {
  const input: unknown = page
  if (!isRecord(input) || !Array.isArray(input['sessions'])) return refuse('sessions', 'type')
  const next = input['next']
  if (next !== null && typeof next !== 'string') return refuse('next', 'type')
  const items: Readonly<{ holder: string; tenant: TenantId; shape: ToolShape }>[] = []
  for (const [index, reference] of page.sessions.entries()) {
    const shape = readShape(reference.shape, `sessions[${index}].shape`)
    if ('failure' in shape) return shape
    items.push(
      Object.freeze({ holder: reference.session, tenant: reference.tenant, shape: shape.ok }),
    )
  }
  return succeed(Object.freeze({ items: Object.freeze(items), next: page.next }))
}
