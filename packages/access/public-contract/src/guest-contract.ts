import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { defineProtocol, type OperationContract, type ProtocolContract } from './protocol.ts'
import { ruleCodec, type Codec } from './rule-codec.ts'
import type { LeafKind, Rule } from './rule.ts'

export type GuestOperationData = Readonly<{
  effect: 'read' | 'commit'
  limit: 'small' | 'input'
  body: Rule
  result: Rule
}>

/** The contract of a protocol of a tenant, written as data: what a plugin gives, and what the server tells of it. */
export type GuestContractData = Readonly<{
  name: string
  major: number
  operations: Readonly<Record<string, GuestOperationData>>
}>

export type GuestContractRead =
  | Readonly<{ ok: Readonly<{ contract: ProtocolContract; data: GuestContractData }> }>
  | Readonly<{ reason: string }>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const codecOf = ruleCodec as unknown as (rule: Rule) => Codec<unknown>

/** Every kind a leaf of a rule can be: a record, so the compiler holds it to `LeafKind`. */
const LEAVES: Readonly<Record<LeafKind, true>> = {
  text: true,
  string: true,
  boolean: true,
  null: true,
  account: true,
  organization: true,
  login: true,
  tenant: true,
  instant: true,
  'plain-date': true,
  session: true,
  'page-bytes': true,
  bytes: true,
  revision: true,
  'positive-integer': true,
  count: true,
  'page-limit': true,
  parameters: true,
  json: true,
  'user-message': true,
}
const KINDS = [...Object.keys(LEAVES), 'literal', 'object', 'array', 'one-of'].join(', ')

function fieldsFault(fields: unknown, at: string): string | undefined {
  if (!isRecord(fields)) return `${at}: an object rule has fields`
  for (const [name, field] of Object.entries(fields)) {
    if (!isRecord(field)) return `${at}.${name}: a field is { rule, optional?, since? }`
    const fault = ruleFault(field['rule'], `${at}.${name}`)
    if (fault !== undefined) return fault
  }
  return undefined
}

/** The first thing a rule written as data gets wrong, named by where it is; nothing when it is a rule. */
function ruleFault(rule: unknown, at: string): string | undefined {
  if (!isRecord(rule) || typeof rule['kind'] !== 'string') return `${at}: a rule is { kind, … }`
  const kind = rule['kind']
  if (Object.hasOwn(LEAVES, kind)) return undefined
  switch (kind) {
    case 'literal': {
      const values = rule['values']
      return Array.isArray(values) &&
        values.length > 0 &&
        values.every(value => typeof value === 'string' || typeof value === 'boolean')
        ? undefined
        : `${at}: a literal rule has values, each a string or a boolean`
    }
    case 'object':
      return fieldsFault(rule['fields'], at)
    case 'array':
      return rule['item'] === undefined
        ? `${at}: an array rule has an item`
        : ruleFault(rule['item'], `${at}[]`)
    case 'one-of': {
      const rules = rule['rules']
      if (!Array.isArray(rules) || rules.length === 0) return `${at}: a one-of rule has rules`
      for (const each of rules) {
        const fault = ruleFault(each, at)
        if (fault !== undefined) return fault
      }
      return undefined
    }
    default:
      return `${at}: ${kind} is not a kind of rule; a rule is one of ${KINDS}`
  }
}

const EFFECTS: ReadonlySet<unknown> = new Set(['read', 'commit'])
const LIMITS: ReadonlySet<unknown> = new Set(['small', 'input'])

function operationOf(name: string, given: unknown): GuestOperationData | string {
  if (!isRecord(given)) return `${name}: an operation is { effect, limit, body, result }`
  const { effect, limit, body, result } = given
  if (!EFFECTS.has(effect)) return `${name}: effect is read or commit`
  if (!LIMITS.has(limit)) return `${name}: limit is small or input`
  return { effect, limit, body, result } as GuestOperationData
}

function contractOf(name: string, operation: GuestOperationData): OperationContract | string {
  const fault =
    ruleFault(operation.body as unknown, 'body') ?? ruleFault(operation.result as unknown, 'result')
  if (fault !== undefined) return `${name}: ${fault}`
  try {
    return {
      identity: 'acting-tenant',
      effect: operation.effect,
      limit: operation.limit,
      body: codecOf(operation.body),
      outcomes: { succeeded: codecOf(operation.result) },
    }
  } catch (error) {
    return `${name}: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** Makes the contract a protocol of a tenant is written as into a protocol contract; the first fault, never a throw. */
export function guestContract(given: unknown): GuestContractRead {
  if (!isRecord(given)) return { reason: 'a contract is { name, major, operations }' }
  const { name, major, operations } = given
  if (typeof name !== 'string' || !Number.isInteger(major) || !isRecord(operations))
    return { reason: 'a contract is { name, major, operations }' }
  const read: Record<string, GuestOperationData> = {}
  const contracts: Record<string, OperationContract> = {}
  for (const [operation, value] of Object.entries(operations)) {
    const data = operationOf(operation, value)
    if (typeof data === 'string') return { reason: data }
    const contract = contractOf(operation, data)
    if (typeof contract === 'string') return { reason: contract }
    read[operation] = data
    contracts[operation] = contract
  }
  try {
    const contract = defineProtocol({
      name,
      major: major as number,
      operations: contracts,
      observations: {},
    } as ProtocolContract)
    return { ok: { contract, data: { name, major: major as number, operations: read } } }
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) }
  }
}

/** The data a contract of a tenant's protocol was made from, read back from its rules. */
export function guestContractData(contract: ProtocolContract): GuestContractData {
  return {
    name: contract.name,
    major: contract.major,
    operations: Object.fromEntries(
      Object.entries(contract.operations).map(([name, operation]) => [
        name,
        {
          effect: operation.effect,
          limit: operation.limit,
          body: operation.body.rule as Rule,
          result: operation.outcomes.succeeded.rule as Rule,
        },
      ]),
    ),
  }
}

/** The contract a reader of `scoped` is told, read from the tree its answer carries it in. */
export const guestContractOfTree = (tree: JsonValue): GuestContractRead =>
  guestContract(JSON.parse(writeJsonText(tree)))
