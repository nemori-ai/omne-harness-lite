import { judgeContentBlock } from '@omne-harness/content-block'
import { judgeMessage } from '@omne-harness/message'
import { judgeJsonValue } from '@omne-harness/json-text'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeCredentialId } from './credential-values.ts'
import type {
  Adoption,
  ConsumerRef,
  FixedModelRequest,
  Parameter,
  ResultCapacity,
  Supplier,
  ToolDeclaration,
} from './root.ts'
import type { ParameterAdoption } from './profile.ts'
import type { ModelInputRejection } from './judge-request.ts'
import { rejected } from './input-tree.ts'

type Checked<T> = Outcome<T, ModelInputRejection>
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** This module only receives the descriptor snapshot, never the caller's objects. */
export function closed(
  value: unknown,
  keys: readonly string[],
  field: string,
): Checked<Record<string, unknown>> {
  if (!isRecord(value)) return rejected(field, 'type')
  if (Object.keys(value).some(key => !keys.includes(key))) return rejected(field, 'unknown-field')
  for (const key of keys)
    if (!Object.hasOwn(value, key)) return rejected(`${field}/${key}`, 'missing')
  return succeed(value)
}
function text(value: unknown, field: string): Checked<string> {
  return typeof value === 'string' && value.length > 0 ? succeed(value) : rejected(field, 'value')
}
function integer(value: unknown, field: string, positive = false): Checked<string> {
  return typeof value === 'string' &&
    /^(0|[1-9][0-9]*)$/u.test(value) &&
    (!positive || value !== '0')
    ? succeed(value)
    : rejected(field, 'integer')
}
function sequence<T>(
  value: unknown,
  field: string,
  parse: (value: unknown, field: string) => Checked<T>,
): Checked<T[]> {
  if (!Array.isArray(value)) return rejected(field, 'type')
  const result: T[] = []
  for (const [index, entry] of value.entries()) {
    const parsed = parse(entry, `${field}/${index}`)
    if ('failure' in parsed) return parsed
    result.push(parsed.ok)
  }
  return succeed(result)
}
function adoption(value: unknown, field: string): Checked<Adoption> {
  const record = closed(value, ['owner', 'name', 'revision', 'digest'], field)
  if ('failure' in record) return record
  const owner = text(record.ok.owner, `${field}/owner`)
  if ('failure' in owner) return owner
  const name = text(record.ok.name, `${field}/name`)
  if ('failure' in name) return name
  const revision = text(record.ok.revision, `${field}/revision`)
  if ('failure' in revision) return revision
  const digest = record.ok.digest
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/u.test(digest))
    return rejected(`${field}/digest`, 'adoption')
  return succeed({ owner: owner.ok, name: name.ok, revision: revision.ok, digest })
}
function credential(value: unknown, field: string): Checked<Supplier['credential']> {
  if (!isRecord(value)) return rejected(field, 'type')
  const record = closed(value, value.kind === 'factory' ? ['kind'] : ['kind', 'id'], field)
  if ('failure' in record) return record
  if (record.ok.kind === 'factory') return succeed({ kind: 'factory' })
  if (record.ok.kind !== 'tenant') return rejected(`${field}/kind`, 'value')
  const id = decodeCredentialId(record.ok.id)
  return 'failure' in id
    ? rejected(`${field}/id`, 'identity')
    : succeed({ kind: 'tenant', id: id.ok })
}
function supplier(value: unknown, field: string): Checked<Supplier> {
  const record = closed(value, ['adoption', 'recipient', 'model', 'credential'], field)
  if ('failure' in record) return record
  const adopted = adoption(record.ok.adoption, `${field}/adoption`)
  if ('failure' in adopted) return adopted
  const recipient = text(record.ok.recipient, `${field}/recipient`)
  if ('failure' in recipient) return recipient
  const model = text(record.ok.model, `${field}/model`)
  if ('failure' in model) return model
  const selected = credential(record.ok.credential, `${field}/credential`)
  if ('failure' in selected) return selected
  return succeed({
    adoption: adopted.ok,
    recipient: recipient.ok,
    model: model.ok,
    credential: selected.ok,
  })
}
function parameter(value: unknown, field: string): Checked<Parameter> {
  if (!isRecord(value)) return rejected(field, 'type')
  const record = closed(
    value,
    value.kind === 'extension' ? ['kind', 'definition', 'value'] : ['kind', 'value'],
    field,
  )
  if ('failure' in record) return record
  const kind = record.ok.kind
  const item = record.ok.value
  const at = `${field}/value`
  switch (kind) {
    case 'temperature':
    case 'top-p':
    case 'frequency-penalty':
    case 'presence-penalty': {
      const min = kind === 'temperature' || kind === 'top-p' ? 0 : -2
      const max = kind === 'top-p' ? 1 : 2
      if (
        typeof item !== 'number' ||
        !Number.isFinite(item) ||
        item < min ||
        item > max ||
        (kind === 'top-p' && item === 0)
      )
        return rejected(at, 'range')
      return succeed({ kind, value: item })
    }
    case 'max-output-tokens':
    case 'seed': {
      const parsed = integer(item, at, kind === 'max-output-tokens')
      return 'failure' in parsed ? parsed : succeed({ kind, value: parsed.ok })
    }
    case 'stop': {
      const parsed = sequence(item, at, text)
      if ('failure' in parsed) return parsed
      if (parsed.ok.length === 0) return rejected(at, 'value')
      if (new Set(parsed.ok).size !== parsed.ok.length) return rejected(at, 'duplicate')
      return succeed({ kind, value: parsed.ok })
    }
    case 'reasoning-effort':
      return item === 'none' ||
        item === 'low' ||
        item === 'medium' ||
        item === 'high' ||
        item === 'max'
        ? succeed({ kind, value: item })
        : rejected(at, 'value')
    case 'extension': {
      const definition = adoption(record.ok.definition, `${field}/definition`)
      if ('failure' in definition) return definition
      const parsed = judgeJsonValue(item)
      return 'rejected' in parsed
        ? rejected(at, 'json')
        : succeed({ kind, definition: definition.ok, value: parsed.ok })
    }
    default:
      return rejected(`${field}/kind`, 'value')
  }
}
function parameterAdoption(value: unknown, field: string): Checked<ParameterAdoption> {
  const record = closed(value, ['supplier', 'applied', 'origin'], field)
  if ('failure' in record) return record
  const selected = adoption(record.ok.supplier, `${field}/supplier`)
  if ('failure' in selected) return selected
  const applied = parameter(record.ok.applied, `${field}/applied`)
  if ('failure' in applied) return applied
  const rawOrigin = record.ok.origin
  if (!isRecord(rawOrigin)) return rejected(`${field}/origin`, 'type')
  const origin = closed(
    rawOrigin,
    rawOrigin.kind === 'explicit' ? ['kind', 'requested', 'source'] : ['kind', 'source'],
    `${field}/origin`,
  )
  if ('failure' in origin) return origin
  const source = adoption(origin.ok.source, `${field}/origin/source`)
  if ('failure' in source) return source
  if (origin.ok.kind === 'default')
    return succeed({
      supplier: selected.ok,
      applied: applied.ok,
      origin: { kind: 'default', source: source.ok },
    })
  if (origin.ok.kind !== 'explicit') return rejected(`${field}/origin/kind`, 'value')
  const requested = parameter(origin.ok.requested, `${field}/origin/requested`)
  return 'failure' in requested
    ? requested
    : succeed({
        supplier: selected.ok,
        applied: applied.ok,
        origin: { kind: 'explicit', source: source.ok, requested: requested.ok },
      })
}
function tool(value: unknown, field: string): Checked<ToolDeclaration> {
  const record = closed(value, ['name', 'description', 'argumentsSchema'], field)
  if ('failure' in record) return record
  const name = text(record.ok.name, `${field}/name`)
  if ('failure' in name) return name
  if (typeof record.ok.description !== 'string') return rejected(`${field}/description`, 'type')
  const schema = judgeJsonValue(record.ok.argumentsSchema)
  return 'rejected' in schema
    ? rejected(`${field}/argumentsSchema`, 'json')
    : succeed({ name: name.ok, description: record.ok.description, argumentsSchema: schema.ok })
}
function toolChoice(
  value: unknown,
  field: string,
  tools: readonly ToolDeclaration[],
): Checked<FixedModelRequest['toolChoice']> {
  if (value === 'none' || value === 'auto' || value === 'required') return succeed(value)
  const record = closed(value, ['name'], field)
  if ('failure' in record) return record
  return typeof record.ok.name === 'string' && tools.some(tool => tool.name === record.ok.name)
    ? succeed({ name: record.ok.name })
    : rejected(`${field}/name`, 'selection')
}

export function requestShape(value: unknown, field: string): Checked<FixedModelRequest> {
  const record = closed(
    value,
    [
      'profile',
      'suppliers',
      'fallback',
      'retryPolicy',
      'parameters',
      'system',
      'messages',
      'tools',
      'toolChoice',
      'representation',
      'parameterAdoptions',
      'source',
    ],
    field,
  )
  if ('failure' in record) return record
  const input = record.ok
  const profile = adoption(input.profile, `${field}/profile`)
  if ('failure' in profile) return profile
  const suppliers = sequence(input.suppliers, `${field}/suppliers`, supplier)
  if ('failure' in suppliers) return suppliers
  const [first, ...rest] = suppliers.ok
  if (first === undefined) return rejected(`${field}/suppliers`, 'value')
  if (new Set(suppliers.ok.map(item => JSON.stringify(item))).size !== suppliers.ok.length)
    return rejected(`${field}/suppliers`, 'duplicate')
  if (typeof input.fallback !== 'boolean') return rejected(`${field}/fallback`, 'type')
  const retryPolicy = adoption(input.retryPolicy, `${field}/retryPolicy`)
  if ('failure' in retryPolicy) return retryPolicy
  const parameters = sequence(input.parameters, `${field}/parameters`, parameter)
  if ('failure' in parameters) return parameters
  const parameterKeys = parameters.ok.map(item =>
    item.kind === 'extension' ? JSON.stringify(item.definition) : item.kind,
  )
  if (new Set(parameterKeys).size !== parameterKeys.length)
    return rejected(`${field}/parameters`, 'duplicate')
  const system = sequence(input.system, `${field}/system`, (item, at) => {
    const parsed = judgeContentBlock(item)
    return 'rejected' in parsed ? rejected(at, 'content') : succeed(parsed.ok)
  })
  if ('failure' in system) return system
  const messages = sequence(input.messages, `${field}/messages`, (item, at) => {
    const parsed = judgeMessage(item)
    return 'rejected' in parsed ? rejected(at, 'message') : succeed(parsed.ok)
  })
  if ('failure' in messages) return messages
  const tools = sequence(input.tools, `${field}/tools`, tool)
  if ('failure' in tools) return tools
  if (new Set(tools.ok.map(item => item.name)).size !== tools.ok.length)
    return rejected(`${field}/tools`, 'duplicate')
  const choice = toolChoice(input.toolChoice, `${field}/toolChoice`, tools.ok)
  if ('failure' in choice) return choice
  const representation = adoption(input.representation, `${field}/representation`)
  if ('failure' in representation) return representation
  const parameterAdoptions = sequence(
    input.parameterAdoptions,
    `${field}/parameterAdoptions`,
    parameterAdoption,
  )
  if ('failure' in parameterAdoptions) return parameterAdoptions
  const source = adoption(input.source, `${field}/source`)
  if ('failure' in source) return source
  return succeed({
    profile: profile.ok,
    suppliers: [first, ...rest],
    fallback: input.fallback,
    retryPolicy: retryPolicy.ok,
    parameters: parameters.ok,
    system: system.ok,
    messages: messages.ok,
    tools: tools.ok,
    toolChoice: choice.ok,
    representation: representation.ok,
    parameterAdoptions: parameterAdoptions.ok,
    source: source.ok,
  })
}
export function consumerShape(value: unknown): Checked<ConsumerRef> {
  const record = closed(value, ['owner', 'work', 'position', 'purpose'], '/consumer')
  if ('failure' in record) return record
  const owner = text(record.ok.owner, '/consumer/owner')
  if ('failure' in owner) return owner
  const work = text(record.ok.work, '/consumer/work')
  if ('failure' in work) return work
  const position = text(record.ok.position, '/consumer/position')
  if ('failure' in position) return position
  const purpose = text(record.ok.purpose, '/consumer/purpose')
  return 'failure' in purpose
    ? purpose
    : succeed({ owner: owner.ok, work: work.ok, position: position.ok, purpose: purpose.ok })
}
export function capacityShape(value: unknown): Checked<ResultCapacity> {
  const record = closed(value, ['bytes', 'blocks', 'attachmentBytes'], '/capacity')
  if ('failure' in record) return record
  const bytes = integer(record.ok.bytes, '/capacity/bytes', true)
  if ('failure' in bytes) return bytes
  const blocks = integer(record.ok.blocks, '/capacity/blocks', true)
  if ('failure' in blocks) return blocks
  const attachmentBytes = integer(record.ok.attachmentBytes, '/capacity/attachmentBytes')
  return 'failure' in attachmentBytes
    ? attachmentBytes
    : succeed({ bytes: bytes.ok, blocks: blocks.ok, attachmentBytes: attachmentBytes.ok })
}
