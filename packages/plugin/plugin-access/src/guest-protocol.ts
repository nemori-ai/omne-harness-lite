import type { AccessContribution, OperationHandler } from '@omne-harness/access-cordis-contract'
import type { Bound, Port, PortData } from '@omne-harness/plugin-protocol'
import {
  defineProtocol,
  ruleCodec,
  type Codec,
  type OperationContract,
  type ProtocolContract,
  type Rule,
} from '@omne-harness/public-contract'

export type GuestOperation = Readonly<{
  effect: 'read' | 'commit'
  limit: 'small' | 'input'
  body: Rule
  result: Rule
}>

export type GuestAnswer =
  | Readonly<{ outcome: 'succeeded'; body: PortData }>
  | Readonly<{ outcome: 'denied' | 'basis-unavailable' | 'unknown' }>

/** A handler of a plugin: the input and the ports of this call, nothing else. It never sees who calls. */
export type GuestHandler = (
  input: PortData,
  call: Readonly<{ ports: Readonly<Record<string, Port>> }>,
) => Promise<GuestAnswer>

/** What the code of a plugin gives the point `access.protocols`: a protocol written as data, and its handlers. */
export type GuestProtocolMade = Readonly<{
  contract: Readonly<{
    name: string
    major: number
    operations: Readonly<Record<string, GuestOperation>>
  }>
  handlers: Readonly<Record<string, GuestHandler>>
}>

type Context = Readonly<{ key: string; bind: (principal: unknown) => Bound }>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The rules come from the plugin, so their values are not known to the type system here. */
const codecOf = ruleCodec as unknown as (rule: Rule) => Codec<unknown>

const FAILED = { read: 'basis-unavailable', commit: 'unknown' } as const
const PASSED: ReadonlySet<string> = new Set(['denied', 'basis-unavailable', 'unknown'])

function shapeOf(made: unknown): GuestProtocolMade {
  if (!isRecord(made) || !isRecord(made['contract']) || !isRecord(made['handlers']))
    throw new Error('a protocol is { contract, handlers }')
  const { name, major, operations } = made['contract']
  if (typeof name !== 'string' || !Number.isInteger(major) || !isRecord(operations))
    throw new Error('a contract is { name, major, operations }')
  return made as GuestProtocolMade
}

function contractOf(name: string, operation: GuestOperation): OperationContract {
  try {
    return {
      identity: 'acting-tenant',
      effect: operation.effect,
      limit: operation.limit,
      body: codecOf(operation.body),
      outcomes: { succeeded: codecOf(operation.result) },
    }
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Each call opens the ports as its caller and closes them when the handler returns or throws. */
function handlerOf(
  handler: GuestHandler,
  effect: GuestOperation['effect'],
  bind: Context['bind'],
): OperationHandler<OperationContract> {
  return async (call, body) => {
    const bound = bind(call.principal)
    try {
      const answer: unknown = await handler(body as PortData, { ports: bound.ports })
      if (isRecord(answer) && answer['outcome'] === 'succeeded' && 'body' in answer)
        return { outcome: 'succeeded', body: answer['body'] }
      if (isRecord(answer) && PASSED.has(String(answer['outcome'])))
        return { outcome: String(answer['outcome']) } as never
      return { outcome: FAILED[effect] } as never
    } catch {
      return { outcome: FAILED[effect] } as never
    } finally {
      bound.close()
    }
  }
}

/** Turns what a plugin gave `access.protocols` into a contribution of the access contract, for callers acting for a tenant only. */
export function guestProtocol(
  made: unknown,
  context: Context,
): AccessContribution<ProtocolContract> {
  const { contract, handlers } = shapeOf(made)
  const key = `${contract.name}/v${contract.major}`
  if (key !== context.key)
    throw new Error(`the member is at ${context.key}; the protocol it gives is ${key}`)
  const names = Object.keys(contract.operations)
  const missing = names.find(name => typeof handlers[name] !== 'function')
  if (missing !== undefined) throw new Error(`no handler for the operation ${missing}`)
  const stray = Object.keys(handlers).filter(name => !names.includes(name))
  if (stray.length > 0) throw new Error(`a handler for no operation: ${stray.join(', ')}`)
  const protocol = defineProtocol({
    name: contract.name,
    major: contract.major,
    operations: Object.fromEntries(
      names.map(name => [name, contractOf(name, contract.operations[name] as GuestOperation)]),
    ),
    observations: {},
  } as ProtocolContract)
  const operations = Object.fromEntries(
    names.map(name => {
      const { effect } = contract.operations[name] as GuestOperation
      return [name, handlerOf(handlers[name] as GuestHandler, effect, context.bind)]
    }),
  )
  return { protocol, operations, observations: {} } as AccessContribution<ProtocolContract>
}
