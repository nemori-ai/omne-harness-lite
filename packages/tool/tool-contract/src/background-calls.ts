import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import {
  decodeToolCallId,
  decodeToolRevision,
  type ToolCallId,
  type ToolRevision,
} from './identity.ts'
import {
  decodeToolInvocationRef,
  readToolInvocationRef,
  type ToolInvocationRef,
} from './reference.ts'
import type { PhysicalExecution, ToolTask } from './records.ts'
import type { ToolState } from './results.ts'
import {
  filled,
  identity,
  judgeUnknown,
  list,
  literal,
  nullable,
  record,
  refine,
  reject,
  type Check,
} from './shape.ts'

export type ToolBackgroundCallsValue = Readonly<{
  tenant: TenantId
  calls: readonly Readonly<{
    call: ToolCallId
    reference: ToolInvocationRef
    activity: string
    waiting: string | null
    revision: ToolRevision
    phase: ToolState['phase']
    execution: PhysicalExecution['kind']
    pending: readonly ToolTask['kind'][]
    delivery: 'none' | 'pending' | 'released'
  }>[]
}>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'tool.background-calls': ToolBackgroundCallsValue
  }
}

const tenantShape = record({
  name: literal('TenantId'),
  organization: record({ name: literal('OrganizationId'), text: filled }),
  account: record({ name: literal('AccountId'), text: filled }),
})
const tenant: Check<TenantId> = (value, at) => {
  const shaped = tenantShape(value, at)
  if ('failure' in shaped) return shaped
  const decoded = tenantCodec.parse(
    JSON.stringify({
      organization: shaped.ok.organization.text,
      account: shaped.ok.account.text,
    }),
  )
  return decoded.ok ? succeed(decoded.value) : reject(at, decoded.error.code)
}

const callShape: Check<ToolBackgroundCallsValue['calls'][number]> = record({
  call: identity(decodeToolCallId),
  reference: identity(decodeToolInvocationRef),
  activity: filled,
  waiting: nullable(filled),
  revision: identity(decodeToolRevision),
  phase: literal('accepted', 'preparing', 'queued', 'starting', 'running', 'suspended', 'settled'),
  execution: literal('not-started', 'starting', 'live', 'unknown', 'suspended', 'ended', 'lost'),
  pending: list(
    literal(
      'prepare',
      'release',
      'start',
      'answer',
      'stop',
      'suspend',
      'wait-registration',
      'deliver',
      'queue',
      'settle',
      'account',
      'facts',
      'clock',
      'child',
      'program-fence',
      'resource-wait',
      'fact-ack',
    ),
  ),
  delivery: literal('none', 'pending', 'released'),
})
const valueShape = refine(record({ tenant, calls: list(callShape) }), value => {
  for (const [index, call] of value.calls.entries()) {
    const reference = readToolInvocationRef(call.reference)
    if (!tenantEquals(reference.tenant, value.tenant) || reference.call !== call.call)
      return { field: `calls[${index}].reference`, reason: 'call-mismatch' }
  }
  return undefined
})

/** Closed value validation only; it proves neither current access nor original admission. */
export const backgroundCallsSchema: SuppliedBlockDescriptor<
  'tool.background-calls',
  ToolBackgroundCallsValue
>['schema'] = {
  '~standard': {
    version: 1,
    vendor: 'omne-tool',
    validate(value) {
      const judged = judgeUnknown(valueShape, value, 'ToolBackgroundCallsValue')
      return 'ok' in judged
        ? { value: judged.ok }
        : { issues: [{ message: `${judged.failure.field}: ${judged.failure.reason}` }] }
    },
  },
}

export const backgroundCallsBlock: SuppliedBlockDescriptor<
  'tool.background-calls',
  ToolBackgroundCallsValue
> & { readonly volatility: 'stable' } = Object.freeze({
  key: 'tool.background-calls',
  kind: 'supplied',
  recovery: 'recompute',
  schema: backgroundCallsSchema,
  consumers: ['model', 'tool', 'extension'] as const,
  volatility: 'stable',
  required: true,
  disclosure: 'eligibility-checked',
  carriesPrevious: false,
})
