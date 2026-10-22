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
import type { ParameterAdoption, ReplayDeclaration } from './profile.ts'
import type { ModelInputRejection } from './judge-request.ts'
import { rejected } from './input-tree.ts'
import { judgeReplayDeclaration } from './replay-values.ts'

type Checked<T> = Outcome<T, ModelInputRejection>
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/**
 * This module only receives the descriptor snapshot, never the caller's objects. Every key in
 * `keys` must be present; a key in `optional` may be absent.
 */
export function closed(
  value: unknown,
  keys: readonly string[],
  field: string,
  optional: readonly string[] = [],
): Checked<Record<string, unknown>> {
  if (!isRecord(value)) return rejected(field, 'type')
  if (Object.keys(value).some(key => !keys.includes(key) && !optional.includes(key)))
    return rejected(field, 'unknown-field')
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
type NumericParameterKind = Extract<Parameter, { value: number }>['kind']
function numericParameter(
  kind: NumericParameterKind,
  item: unknown,
  at: string,
): Checked<Parameter> {
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
function integerParameter(
  kind: 'max-output-tokens' | 'seed',
  item: unknown,
  at: string,
): Checked<Parameter> {
  const parsed = integer(item, at, kind === 'max-output-tokens')
  return 'failure' in parsed ? parsed : succeed({ kind, value: parsed.ok })
}
function stopParameter(item: unknown, at: string): Checked<Parameter> {
  const parsed = sequence(item, at, text)
  if ('failure' in parsed) return parsed
  if (parsed.ok.length === 0) return rejected(at, 'value')
  if (new Set(parsed.ok).size !== parsed.ok.length) return rejected(at, 'duplicate')
  return succeed({ kind: 'stop', value: parsed.ok })
}
function reasoningParameter(item: unknown, at: string): Checked<Parameter> {
  return item === 'none' || item === 'low' || item === 'medium' || item === 'high' || item === 'max'
    ? succeed({ kind: 'reasoning-effort', value: item })
    : rejected(at, 'value')
}
function extensionParameter(record: Record<string, unknown>, field: string): Checked<Parameter> {
  const definition = adoption(record.definition, `${field}/definition`)
  if ('failure' in definition) return definition
  const parsed = judgeJsonValue(record.value)
  return 'rejected' in parsed
    ? rejected(`${field}/value`, 'json')
    : succeed({ kind: 'extension', definition: definition.ok, value: parsed.ok })
}
function parameterValue(record: Record<string, unknown>, field: string): Checked<Parameter> {
  const kind = record.kind
  const item = record.value
  const at = `${field}/value`
  switch (kind) {
    case 'temperature':
    case 'top-p':
    case 'frequency-penalty':
    case 'presence-penalty':
      return numericParameter(kind, item, at)
    case 'max-output-tokens':
    case 'seed':
      return integerParameter(kind, item, at)
    case 'stop':
      return stopParameter(item, at)
    case 'reasoning-effort':
      return reasoningParameter(item, at)
    case 'extension':
      return extensionParameter(record, field)
    default:
      return rejected(`${field}/kind`, 'value')
  }
}
function parameter(value: unknown, field: string): Checked<Parameter> {
  if (!isRecord(value)) return rejected(field, 'type')
  const record = closed(
    value,
    value.kind === 'extension' ? ['kind', 'definition', 'value'] : ['kind', 'value'],
    field,
  )
  return 'failure' in record ? record : parameterValue(record.ok, field)
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

type RequestRouting = Pick<FixedModelRequest, 'profile' | 'suppliers' | 'fallback' | 'retryPolicy'>
type RequestContent = Pick<
  FixedModelRequest,
  'parameters' | 'system' | 'messages' | 'tools' | 'toolChoice'
>
type RequestProvenance = Pick<FixedModelRequest, 'representation' | 'parameterAdoptions' | 'source'>
function requestSuppliers(value: unknown, field: string): Checked<FixedModelRequest['suppliers']> {
  const suppliers = sequence(value, field, supplier)
  if ('failure' in suppliers) return suppliers
  const [first, ...rest] = suppliers.ok
  if (first === undefined) return rejected(field, 'value')
  if (new Set(suppliers.ok.map(item => JSON.stringify(item))).size !== suppliers.ok.length)
    return rejected(field, 'duplicate')
  return succeed([first, ...rest])
}
function requestRouting(input: Record<string, unknown>, field: string): Checked<RequestRouting> {
  const profile = adoption(input.profile, `${field}/profile`)
  if ('failure' in profile) return profile
  const suppliers = requestSuppliers(input.suppliers, `${field}/suppliers`)
  if ('failure' in suppliers) return suppliers
  if (typeof input.fallback !== 'boolean') return rejected(`${field}/fallback`, 'type')
  const retryPolicy = adoption(input.retryPolicy, `${field}/retryPolicy`)
  if ('failure' in retryPolicy) return retryPolicy
  return succeed({
    profile: profile.ok,
    suppliers: suppliers.ok,
    fallback: input.fallback,
    retryPolicy: retryPolicy.ok,
  })
}
function requestParameters(
  value: unknown,
  field: string,
): Checked<FixedModelRequest['parameters']> {
  const parameters = sequence(value, field, parameter)
  if ('failure' in parameters) return parameters
  const parameterKeys = parameters.ok.map(item =>
    item.kind === 'extension' ? JSON.stringify(item.definition) : item.kind,
  )
  if (new Set(parameterKeys).size !== parameterKeys.length) return rejected(field, 'duplicate')
  return parameters
}
function requestTools(
  input: Record<string, unknown>,
  field: string,
): Checked<Pick<FixedModelRequest, 'tools' | 'toolChoice'>> {
  const tools = sequence(input.tools, `${field}/tools`, tool)
  if ('failure' in tools) return tools
  if (new Set(tools.ok.map(item => item.name)).size !== tools.ok.length)
    return rejected(`${field}/tools`, 'duplicate')
  const choice = toolChoice(input.toolChoice, `${field}/toolChoice`, tools.ok)
  if ('failure' in choice) return choice
  return succeed({ tools: tools.ok, toolChoice: choice.ok })
}
function requestContent(input: Record<string, unknown>, field: string): Checked<RequestContent> {
  const parameters = requestParameters(input.parameters, `${field}/parameters`)
  if ('failure' in parameters) return parameters
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
  const tools = requestTools(input, field)
  if ('failure' in tools) return tools
  return succeed({
    parameters: parameters.ok,
    system: system.ok,
    messages: messages.ok,
    ...tools.ok,
  })
}
function requestProvenance(
  input: Record<string, unknown>,
  field: string,
): Checked<RequestProvenance> {
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
    representation: representation.ok,
    parameterAdoptions: parameterAdoptions.ok,
    source: source.ok,
  })
}
type RequestReplay = Pick<FixedModelRequest, 'replay' | 'declarations'>
/** Where a reason of `judgeReplayDeclaration` points inside one declaration, and what it is. */
const DECLARATION_REJECTIONS: Readonly<
  Record<string, Readonly<{ key: string; reason: ModelInputRejection['reason'] }>>
> = {
  produces: { key: 'produces', reason: 'value' },
  accepts: { key: 'accepts', reason: 'value' },
  'accepts-duplicate': { key: 'accepts', reason: 'duplicate' },
  'accepts-lacks-produces': { key: 'accepts', reason: 'value' },
  'foreign-thinking': { key: 'foreignThinking', reason: 'value' },
}
/** One expanded declaration: all three keys must be present, so no default applies. */
function expandedDeclaration(
  value: unknown,
  supplier: Supplier,
  index: number,
  field: string,
): Checked<ReplayDeclaration> {
  const record = closed(value, ['produces', 'accepts', 'foreignThinking'], field)
  if ('failure' in record) return record
  const judged = judgeReplayDeclaration({ ...supplier, replay: record.ok }, index)
  if ('ok' in judged) return judged
  const at = DECLARATION_REJECTIONS[judged.failure.reason] ?? { key: '', reason: 'value' }
  return rejected(at.key === '' ? field : `${field}/${at.key}`, at.reason)
}
function requestReplay(
  input: Record<string, unknown>,
  field: string,
  suppliers: FixedModelRequest['suppliers'],
): Checked<RequestReplay> {
  if (Object.hasOwn(input, 'replay') && input.replay !== 'off')
    return rejected(`${field}/replay`, 'value')
  if (!Array.isArray(input.declarations)) return rejected(`${field}/declarations`, 'type')
  if (input.declarations.length !== suppliers.length)
    return rejected(`${field}/declarations`, 'value')
  const declarations: ReplayDeclaration[] = []
  for (const [index, supplier] of suppliers.entries()) {
    const at = `${field}/declarations/${index}`
    const judged = expandedDeclaration(input.declarations[index], supplier, index, at)
    if ('failure' in judged) return judged
    declarations.push(judged.ok)
  }
  const [first, ...rest] = declarations
  if (first === undefined) return rejected(`${field}/declarations`, 'value')
  const fixed = { declarations: [first, ...rest] } satisfies RequestReplay
  return succeed(input.replay === 'off' ? { replay: 'off', ...fixed } : fixed)
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
      'declarations',
      'representation',
      'parameterAdoptions',
      'source',
    ],
    field,
    ['replay'],
  )
  if ('failure' in record) return record
  const routing = requestRouting(record.ok, field)
  if ('failure' in routing) return routing
  const content = requestContent(record.ok, field)
  if ('failure' in content) return content
  const provenance = requestProvenance(record.ok, field)
  if ('failure' in provenance) return provenance
  const replay = requestReplay(record.ok, field, routing.ok.suppliers)
  if ('failure' in replay) return replay
  return succeed({ ...routing.ok, ...content.ok, ...replay.ok, ...provenance.ok })
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
