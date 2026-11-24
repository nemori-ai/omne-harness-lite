import { writeJsonText } from '@omne-harness/json-text'
import { definePermissionUpperBounds } from '@omne-harness/permissions'
import {
  capabilityId,
  readBodyText,
  readSnapshot,
  type BodyContract,
  type CapabilityId,
  type CategoryDisplay,
  type JsonValue,
  type JudgeContext,
  type Judgment,
} from '@omne-harness/assets'
import { AGENT_TYPES, INSTRUCTION_LIMITS, attributeItem, type AttributeItem } from './definition.ts'
import { instructionsProblem, summaryProblem } from './judge-definition.ts'
import { AGENT_FILE, agentDefinitionLayout } from './layout.ts'

const CATEGORY = 'AgentDefinition'

export const agentDefinitionCategoryDisplay: CategoryDisplay = Object.freeze({
  title: '智能体',
  summary: '一个智能体的定义：它的说明、能用的能力与权限上界。',
  creation: `一个目录，根下只有一个 ${AGENT_FILE}：头部写名字、说明与引用的能力，正文是它的提示词。`,
  authoring: [
    `A definition is a directory with one file, ${AGENT_FILE}: a frontmatter, then the instructions the agent works by. Whole and minimal:`,
    '---',
    'name: reviewer',
    'summary: Reviews one file and reports the problems it finds. Fit for a second look at a change.',
    'references:',
    '  - { category: tool, name: Files, resident: true }',
    '---',
    'You review code. Read the file you are given and report the problems you find, the worst first.',
    'name is the name it is published under, and the name of its directory. summary is read by the agent that chooses whom to hand work to: say what this one is fit for.',
    'references lists the capabilities it uses, each {category, name, resident?}. A tool with resident: true is in every request it makes: a tool of the release, or one published here under category tool. A reference of another category is kept and has no effect yet.',
    'Other fields: attributes (a list of names: model, first_token_wait_limit, post_first_token_stall_limit) and permissionBounds. type is non-master and can be left out.',
    'It is handed work with Agents, or a session is made with it by its name; its last reply is what the one who handed it the work receives. Published again, it is used from the next run.',
    'Kept unpublished in a workspace, under .omne/agents/<name>/, it is there from the next turn of a session in that workspace and can be handed work; a session is made with it by its name only once it is published.',
  ].join('\n'),
})

const schemaRead = readBodyText(
  '{"kind":"agent-definition-body","properties":{"name":"string","type":"master|non-master","summary":"string","references":"[{capability:{category,name},resident?}]","attributes":"[{item}]","instructions?":"[{id,text}]","permissionBounds?":"[{capabilityId,enforcementKey,allowedSet}]"}}',
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

type BodyRefusal =
  | 'incomplete-reference'
  | 'invalid-type'
  | 'invalid-summary'
  | 'name-mismatch'
  | 'duplicate-capability'
  | 'invalid-resident'
  | 'unknown-attribute'
  | 'duplicate-attribute'
  | 'invalid-instructions'
  | 'invalid-permission-bounds'
  | 'unknown-field'

type Refused = { readonly ok: false; readonly rejected: BodyRefusal }
type Step<Value> = ({ readonly ok: true } & Value) | Refused
type Decoded = Step<{
  readonly references: readonly CapabilityId[]
  readonly items: readonly AttributeItem[]
}>

type Member = { readonly key: string; readonly value: JsonValue }

export function agentBodyContract(): BodyContract {
  return {
    category: CATEGORY,
    schema,
    judge,
    deriveDeclarations(body, context) {
      return { entries: decodeOrThrow(body, context).items }
    },
    references(body, context) {
      return decodeOrThrow(body, context).references
    },
    layout: agentDefinitionLayout,
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

function decode(body: unknown, context?: JudgeContext): Decoded {
  const members = membersOf(body)
  if (members === undefined) return reject('incomplete-reference')
  const identity = checkIdentity(members, context)
  if (identity !== undefined) return identity
  const standing = checkStanding(members)
  if (standing !== undefined) return standing
  const references = decodeReferences(valueAt(members, 'references'))
  if (!references.ok) return references
  const items = decodeAttributes(valueAt(members, 'attributes'))
  if (!items.ok) return items
  const instructions = decodeInstructions(valueAt(members, 'instructions'))
  if (!instructions.ok) return instructions
  const permissionBounds = valueAt(members, 'permissionBounds')
  if (
    permissionBounds !== undefined &&
    definePermissionUpperBounds(JSON.parse(writeJsonText(permissionBounds))).kind ===
      'invalid-input'
  )
    return reject('invalid-permission-bounds')
  if (!onlyKeys(members, BODY_KEYS)) return reject('unknown-field')
  return { ok: true, references: references.ids, items: items.items }
}

const BODY_KEYS = [
  'name',
  'type',
  'summary',
  'references',
  'attributes',
  'instructions',
  'permissionBounds',
  'manifest',
]

function checkStanding(members: readonly Member[]): Refused | undefined {
  const type = textOf(valueAt(members, 'type'))
  if (!AGENT_TYPES.some(known => known === type)) return reject('invalid-type')
  const summary = textOf(valueAt(members, 'summary'))
  return summary === undefined || summaryProblem(summary) !== undefined
    ? reject('invalid-summary')
    : undefined
}

function checkIdentity(members: readonly Member[], context?: JudgeContext): Refused | undefined {
  const name = textOf(valueAt(members, 'name'))
  if (name === undefined || name === '') return reject('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName)
    return reject('name-mismatch')
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

function decodeInstructions(value: JsonValue | undefined): Step<Record<never, never>> {
  if (value === undefined) return { ok: true }
  if (value.kind !== 'array' || value.items.length === 0) return reject('invalid-instructions')
  const sections: { id: string; text: string }[] = []
  for (const element of value.items) {
    const members = membersOf(element)
    const id = textOf(valueAt(members, 'id'))
    const text = textOf(valueAt(members, 'text'))
    if (members === undefined || id === undefined || id === '' || text === undefined || text === '')
      return reject('invalid-instructions')
    if (!onlyKeys(members, ['id', 'text'])) return reject('unknown-field')
    sections.push({ id, text })
  }
  if (
    sections.length > INSTRUCTION_LIMITS.maxSections ||
    instructionsProblem(sections) !== undefined
  )
    return reject('invalid-instructions')
  return { ok: true }
}

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
