import type {
  AccessContribution,
  OperationHandler,
} from '@omne-harness/access-cordis-contract'
import {
  guestContract,
  type GuestContractData,
  type OperationContract,
  type ProtocolContract,
} from '@omne-harness/public-contract'
import { protocolItem, type ProtocolItem } from './registry/table.ts'

export type GuestAnswer =
  | Readonly<{ outcome: 'succeeded'; body: unknown }>
  | Readonly<{ outcome: 'denied' | 'basis-unavailable' | 'unknown' }>

/** A handler of a tenant's protocol: the input and the ports of this call, nothing else. It never sees who calls. */
export type GuestHandler = (
  input: unknown,
  call: Readonly<{ ports: Readonly<Record<string, unknown>> }>,
) => Promise<GuestAnswer>

/** What the ports of one call are: handed to the handler, closed when it returns or throws. */
export type GuestBound = Readonly<{ ports: Readonly<Record<string, unknown>>; close(): void }>

export type GuestContext = Readonly<{
  key: string
  bind: (principal: unknown) => GuestBound
  within?: <T>(run: () => T) => T
}>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const FAILED = { read: 'basis-unavailable', commit: 'unknown' } as const
const PASSED: ReadonlySet<string> = new Set(['denied', 'basis-unavailable', 'unknown'])

type Read = Readonly<{
  contract: ProtocolContract
  data: GuestContractData
  handlers: Readonly<Record<string, GuestHandler>>
}>

function readOf(made: unknown): Read {
  if (!isRecord(made) || !isRecord(made['contract']) || !isRecord(made['handlers']))
    throw new Error('a protocol is { contract, handlers }')
  // Read once: what is checked is what is used, whatever getters the code of the plugin wrote.
  const handlers = { ...made['handlers'] } as Read['handlers']
  const read = guestContract(made['contract'])
  if (!('ok' in read)) throw new Error(read.reason)
  return { ...read.ok, handlers }
}

/** Each call opens the ports as its caller and closes them when the handler returns or throws. */
function handlerOf(
  handler: GuestHandler,
  effect: OperationContract['effect'],
  { bind, within }: GuestContext,
): OperationHandler<OperationContract> {
  return async (call, body) => {
    const bound = bind(call.principal)
    try {
      const run = () => handler(body, { ports: bound.ports })
      const answer: unknown = await (within === undefined ? run() : within(run))
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

/** Turns what the code of a plugin gave `access.protocols` into a protocol of its tenant, for callers acting for that tenant only. */
export function guestProtocol(
  made: unknown,
  context: GuestContext,
): Readonly<{ contribution: AccessContribution<ProtocolContract>; data: GuestContractData }> {
  const { contract, data, handlers } = readOf(made)
  const key = `${data.name}/v${data.major}`
  if (key !== context.key)
    throw new Error(`the member is at ${context.key}; the protocol it gives is ${key}`)
  const names = Object.keys(data.operations)
  const missing = names.find(name => typeof handlers[name] !== 'function')
  if (missing !== undefined) throw new Error(`no handler for the operation ${missing}`)
  const stray = Object.keys(handlers).filter(name => !names.includes(name))
  if (stray.length > 0) throw new Error(`a handler for no operation: ${stray.join(', ')}`)
  const operations = Object.fromEntries(
    names.map(name => [
      name,
      handlerOf(handlers[name] as GuestHandler, data.operations[name]!.effect, context),
    ]),
  )
  const contribution = { protocol: contract, operations, observations: {} }
  return { contribution: contribution as AccessContribution<ProtocolContract>, data }
}

/** The item `access.protocols` holds for a protocol of a tenant: it keeps the contract as its plugin wrote it. */
export function guestItem(made: unknown, context: GuestContext): ProtocolItem {
  const { contribution, data } = guestProtocol(made, context)
  return protocolItem(contribution, data)
}
