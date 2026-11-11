// Wait protocol handles (P12) and the value schema shape that they share with program output.
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

/**
 * A schema reference is a load capability. The check reads its `id` and confirms that `load` is a
 * function. It never calls `load`, and it keeps the reference itself.
 */
const schemaRef: Check<SchemaRef<unknown>> = (value, at) => {
  if (typeof value !== 'object' || value === null) return reject(at, 'type')
  const id = slot(value, 'id')
  if (id.kind !== 'value' || typeof id.value !== 'string' || id.value.length === 0)
    return reject(member(at, 'id'), 'type')
  const load = slot(value, 'load')
  if (load.kind !== 'value' || typeof load.value !== 'function')
    return reject(member(at, 'load'), 'type')
  // `id` and `load` have the SchemaRef shape. The reference is a capability, not data to copy.
  return succeed(value as SchemaRef<unknown>)
}

export const valueSchema: Check<ToolValueSchema<unknown>> = record({
  identity: schemaIdentity,
  ref: schemaRef,
  maxBytes: positiveSafeInteger,
})

/**
 * The most bytes the request of the Ask of a checkpointed author may take. The ledger keeps the
 * request original as text in one record of the call domain and writes it in the commit that
 * saves the wait fact. Escaped inside the record, the text takes at most twice its size.
 */
export const WAIT_REQUEST_MAX_BYTES = 262_144

/**
 * The most bytes the response to the Ask of a checkpointed author may take. The ledger keeps the
 * response in the wait record and writes it in the commit that accepts the decision. With
 * CHECKPOINT_STATE_MAX_BYTES the two bounds keep each of those commits inside the command limit
 * of the record store, and the call domain inside its read limit.
 */
export const WAIT_RESPONSE_MAX_BYTES = 524_288

const protocol = {
  adoption,
  request: valueSchema,
  response: valueSchema,
}

/** Ask has no expiry. A resource protocol may support one (P06, P11). */
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

/** True only for a handle that `defineToolWaitContract` made. */
export function isToolWaitContract(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, waitContractMark)
}

/**
 * Fixes a wait protocol declaration as a handle (P12). It checks the closed shape, and that an
 * Ask protocol forbids expiry. It loads no schema and grants no permission.
 */
export function defineToolWaitContract<A, K extends 'ask' | 'resource'>(
  definition: ToolWaitProtocolDefinition<A, K>,
): Outcome<ToolWaitContract<A, K>, Readonly<{ reason: string }>> {
  const checked = judgeUnknown(waitProtocol, definition, 'definition')
  if ('failure' in checked) return fail({ reason: describeRejection(checked.failure) })
  const handle = { ...checked.ok }
  Object.defineProperty(handle, waitContractMark, { value: true })
  // The copy passed the check of this protocol kind. The mark is the brand of a fixed handle.
  return succeed(Object.freeze(handle) as unknown as ToolWaitContract<A, K>)
}
