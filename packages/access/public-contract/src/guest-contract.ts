import { defineProtocol, type OperationContract, type ProtocolContract } from './protocol.ts'
import { ruleCodec, type Codec } from './rule-codec.ts'
import type { Rule } from './rule.ts'

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
