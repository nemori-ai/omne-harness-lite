import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SchemaRef } from '@omne-harness/schema-provider'
import type { ToolWaitContract, ToolWaitProtocolDefinition } from './author-context.ts'
import type { ToolValueSchema } from './definitions.ts'
import {
  describeRejection,
  judgeUnknown,
  literal,
  member,
  positiveSafeInteger,
  record,
  reject,
  slot,
  variant,
  type Check,
} from './shape.ts'
import { adoption, schemaIdentity } from './value-shapes.ts'

const schemaRef: Check<SchemaRef<unknown>> = (value, at) => {
  if (typeof value !== 'object' || value === null) return reject(at, 'type')
  const id = slot(value, 'id')
  if (id.kind !== 'value' || typeof id.value !== 'string' || id.value.length === 0)
    return reject(member(at, 'id'), 'type')
  const load = slot(value, 'load')
  if (load.kind !== 'value' || typeof load.value !== 'function')
    return reject(member(at, 'load'), 'type')
  return succeed(value as SchemaRef<unknown>)
}

export const valueSchema: Check<ToolValueSchema<unknown>> = record({
  identity: schemaIdentity,
  ref: schemaRef,
  maxBytes: positiveSafeInteger,
})

export const WAIT_REQUEST_MAX_BYTES = 262_144

export const WAIT_RESPONSE_MAX_BYTES = 524_288

const protocol = {
  adoption,
  request: valueSchema,
  response: valueSchema,
}

const waitProtocol: Check<ToolWaitProtocolDefinition<unknown, 'ask' | 'resource'>> = variant(
  'kind',
  {
    ask: record({ ...protocol, kind: literal('ask'), expiry: literal('forbidden') }),
    resource: record({
      ...protocol,
      kind: literal('resource'),
      expiry: literal('forbidden', 'supported'),
    }),
  },
)

const waitContractMark: unique symbol = Symbol('tool-wait-contract')

export function isToolWaitContract(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, waitContractMark)
}

export function defineToolWaitContract<A, K extends 'ask' | 'resource'>(
  definition: ToolWaitProtocolDefinition<A, K>,
): Outcome<ToolWaitContract<A, K>, Readonly<{ reason: string }>> {
  const checked = judgeUnknown(waitProtocol, definition, 'definition')
  if ('failure' in checked) return fail({ reason: describeRejection(checked.failure) })
  const handle = { ...checked.ok }
  Object.defineProperty(handle, waitContractMark, { value: true })
  return succeed(Object.freeze(handle) as unknown as ToolWaitContract<A, K>)
}
