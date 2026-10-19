import {
  capabilityId,
  readBodyText,
  readSnapshot,
  type BodyContract,
  type CapabilityId,
  type JsonValue,
  type JudgeContext,
  type Judgment,
} from '@omne-harness/assets'
import { ATTRIBUTE_ITEMS, type AttributeItem } from './types.ts'

const CATEGORY = 'AgentDefinition'

const schemaRead = readBodyText(
  '{"kind":"agent-definition-body","properties":{"name":"string","version":"string?","references":"[{capability:{category,name},resident?}]","attributes":"[{item}]"}}',
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('agent definition schema text is not a document')
const schema: JsonValue = schemaRead.value

/** Refusal words of the body judgment. They belong to this category provider, not to `RefusalReason`. */
type BodyRefusal =
  | 'incomplete-reference'
  | 'name-mismatch'
  | 'invalid-version'
  | 'duplicate-capability'
  | 'invalid-resident'
  | 'unknown-attribute'
  | 'duplicate-attribute'
  | 'unknown-field'

type Refused = { readonly ok: false; readonly rejected: BodyRefusal }
type Step<Value> = ({ readonly ok: true } & Value) | Refused
type Decoded = Step<{
  readonly references: readonly CapabilityId[]
  readonly items: readonly AttributeItem[]
}>

type Member = { readonly key: string; readonly value: JsonValue }

/**
 * The category contract of an AgentDefinition body for the `assets` registry.
 * The body carries no `category` key because the registry key names the category.
 * Every function reads the json-text read tree only. None reads the asset library or a clock.
 */
export function agentBodyContract(): BodyContract {
  return {
    category: CATEGORY,
    schema,
    judge,
    deriveDeclarations(body, context) {
      // Judgment rejects duplicate items, so the attribute items are already distinct and ordered.
      return { entries: decodeOrThrow(body, context).items }
    },
    references(body, context) {
      return decodeOrThrow(body, context).references
    },
  }
}

function judge(body: unknown, context?: JudgeContext): Judgment {
  const decoded = decode(body, context)
  if (decoded.ok) return { ok: true }
  return Object.freeze({ ok: false, rejected: decoded.rejected })
}

function decodeOrThrow(
  body: unknown,
  context?: JudgeContext,
): Extract<Decoded, { readonly ok: true }> {
  const decoded = decode(body, context)
  if (!decoded.ok) throw new TypeError(`agent definition body failed judgment: ${decoded.rejected}`)
  return decoded
}

function reject(rejected: BodyRefusal): Refused {
  return { ok: false, rejected }
}

/** The one place the body rules are written. Order of checks follows the rule table. */
function decode(body: unknown, context?: JudgeContext): Decoded {
  const members = membersOf(body)
  if (members === undefined) return reject('incomplete-reference')
  const identity = checkIdentity(members, context)
  if (identity !== undefined) return identity
  const references = decodeReferences(valueAt(members, 'references'))
  if (!references.ok) return references
  const items = decodeAttributes(valueAt(members, 'attributes'))
  if (!items.ok) return items
  if (!onlyKeys(members, ['name', 'version', 'references', 'attributes']))
    return reject('unknown-field')
  return { ok: true, references: references.ids, items: items.items }
}

/** The `name` and `version` rules. `undefined` means both pass. */
function checkIdentity(members: readonly Member[], context?: JudgeContext): Refused | undefined {
  const name = textOf(valueAt(members, 'name'))
  if (name === undefined || name === '') return reject('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName)
    return reject('name-mismatch')
  const version = valueAt(members, 'version')
  if (version !== undefined && (textOf(version) ?? '') === '') return reject('invalid-version')
  return undefined
}

function decodeReferences(
  value: JsonValue | undefined,
): Step<{ readonly ids: readonly CapabilityId[] }> {
  if (value === undefined || value.kind !== 'array') return reject('incomplete-reference')
  const ids: CapabilityId[] = []
  for (const element of value.items) {
    const decoded = decodeReference(element)
    if (!decoded.ok) return decoded
    ids.push(decoded.id)
  }
  if (new Set(ids.map(id => JSON.stringify([id.category, id.name]))).size !== ids.length)
    return reject('duplicate-capability')
  return { ok: true, ids }
}

function decodeReference(element: JsonValue): Step<{ readonly id: CapabilityId }> {
  const members = membersOf(element)
  const capability = membersOf(valueAt(members, 'capability'))
  if (members === undefined || capability === undefined) return reject('incomplete-reference')
  const id = capabilityId(
    textOf(valueAt(capability, 'category')) ?? '',
    textOf(valueAt(capability, 'name')) ?? '',
  )
  if (!id.ok) return reject('incomplete-reference')
  const resident = valueAt(members, 'resident')
  if (resident !== undefined && resident.kind !== 'boolean') return reject('invalid-resident')
  if (!onlyKeys(members, ['capability', 'resident']) || !onlyKeys(capability, ['category', 'name']))
    return reject('unknown-field')
  return { ok: true, id: id.id }
}

function decodeAttributes(
  value: JsonValue | undefined,
): Step<{ readonly items: readonly AttributeItem[] }> {
  if (value === undefined || value.kind !== 'array') return reject('unknown-attribute')
  const items: AttributeItem[] = []
  for (const element of value.items) {
    const members = membersOf(element)
    const item = attributeItem(textOf(valueAt(members, 'item')))
    if (members === undefined || item === undefined) return reject('unknown-attribute')
    if (!onlyKeys(members, ['item'])) return reject('unknown-field')
    if (items.includes(item)) return reject('duplicate-attribute')
    items.push(item)
  }
  return { ok: true, items }
}

function attributeItem(text: string | undefined): AttributeItem | undefined {
  return ATTRIBUTE_ITEMS.find(allowed => allowed === text)
}

/**
 * The entries of an object node of a registered read tree. `readSnapshot` accepts every node
 * of such a tree, so a hand-built look-alike at any depth has no entries.
 */
function membersOf(value: unknown): readonly Member[] | undefined {
  const node = readSnapshot(value)
  return node?.kind === 'object' ? node.entries : undefined
}

function valueAt(members: readonly Member[] | undefined, key: string): JsonValue | undefined {
  return members?.find(member => member.key === key)?.value
}

function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

function onlyKeys(members: readonly Member[], allowed: readonly string[]): boolean {
  return members.every(member => allowed.includes(member.key))
}
