import { fail, succeed } from '@omne-harness/operation-result'
import type {
  ToolCallId,
  ToolInstanceId,
  ToolInvocation,
  ToolInvocationIdentities,
  ToolInvocationSourceIssuer,
  ToolInvokeRequest,
  ToolOperationId,
  ToolOperationIdentities,
  ToolInstanceIdentities,
  FixedToolRequest,
  Mutation,
} from '@omne-harness/tool-contract'
import { judgeToolInvokeRequest } from '@omne-harness/tool-contract'
import { digestOf } from './evidence.ts'
import type { ToolSourceGuard } from './ledger-guards.ts'
import type { TenantId } from './ledger-store.ts'

/** The owner named in every source evidence the test issuer mints. */
export const TEST_SOURCE_OWNER = '@omne-harness/tool/testing'

/** The binding an issuer persisted: everything the source guard later compares. */
export type TestSourceBinding<P> = Readonly<{
  principal: P
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
  request: ToolInvokeRequest
  invocation: ToolInvocation
}>

export type TestInvocationSource<P> = Readonly<{
  /** The trusted entry port the runtime takes: it persists the binding and answers the source. */
  issuer: ToolInvocationSourceIssuer<P>
  /** The guard port the ledger takes: it verifies an admission against the persisted binding. */
  guard: ToolSourceGuard<P>
  /** The persisted bindings, for a test that inspects what an entry signed. */
  bindings(): readonly TestSourceBinding<P>[]
}>

function fingerprint<P>(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): string {
  return digestOf({
    principal: input.principal,
    tenant: [input.tenant.organization.text, input.tenant.account.text],
    call: input.call,
    operation: input.operation,
    request: input.request,
  })
}

/**
 * Builds the paired source issuer and guard. The issuer persists the whole binding of the invoke:
 * the principal, the tenant, the call and the admission, the fixed payload and the entry it
 * answers for. The guard finds the persisted binding by the source record and compares every
 * field of the admission input with it; a missing binding or any disagreement is forged. When
 * `throws` is set the guard throws an Error with that message, as an unreadable source store
 * would surface inside a guard.
 */
export function createTestInvocationSource<P>(
  options: Readonly<{ throws?: string }> = {},
): TestInvocationSource<P> {
  const saved = new Map<string, Readonly<{ binding: TestSourceBinding<P>; fingerprint: string }>>()
  let minted = 0
  const issuer: ToolInvocationSourceIssuer<P> = {
    bind: input => {
      const judged = judgeToolInvokeRequest(input.request)
      if ('failure' in judged) return Promise.resolve(fail({ kind: 'invalid', ...judged.failure }))
      const request = judged.ok
      minted += 1
      const record = `source-${minted}`
      const invocation: ToolInvocation = Object.freeze({
        kind: 'direct',
        source: Object.freeze({
          owner: TEST_SOURCE_OWNER,
          record,
          revision: '1',
          digest: digestOf({
            principal: input.principal,
            tenant: [input.tenant.organization.text, input.tenant.account.text],
            call: input.call,
            admission: input.operation,
            request,
          }),
        }),
      })
      const binding: TestSourceBinding<P> = {
        principal: structuredClone(input.principal),
        tenant: input.tenant,
        call: input.call,
        admission: input.operation,
        request,
        invocation,
      }
      saved.set(record, {
        binding: Object.freeze(binding),
        fingerprint: fingerprint({ ...input, request: { ...request, invocation } }),
      })
      return Promise.resolve(succeed(invocation))
    },
  }
  const guard: ToolSourceGuard<P> = {
    verify: input =>
      new Promise(resolve => {
        if (options.throws !== undefined) throw new Error(options.throws)
        const known = saved.get(input.request.invocation.source.record)
        resolve(
          known === undefined
            ? { kind: 'forged', reason: 'unknown-source' }
            : fingerprint(input) === known.fingerprint
              ? { kind: 'trusted' }
              : { kind: 'forged', reason: 'binding-mismatch' },
        )
      }),
  }
  return Object.freeze({
    issuer,
    guard,
    bindings: () => [...saved.values()].map(known => known.binding),
  })
}

export type TestToolIdentities = Readonly<{
  invocationIdentities: ToolInvocationIdentities
  operationIdentities: ToolOperationIdentities
  instanceIdentities: ToolInstanceIdentities
  /**
   * Queues the pair the next ordinary invoke mints. Without a queue the counter mints
   * `call-N`/`op-N`. The texts are returned as branded without a check, so a test can plan an
   * illegal text and observe the runtime naming the identity-port violation.
   */
  planInvocation(call: string, admission: string): void
}>

/** Test identity counters with optional preplanned invocation pairs, including repeated pairs. */
export function createTestToolIdentities(): TestToolIdentities {
  let invocations = 0
  let operations = 0
  let instances = 0
  const planned: Readonly<{ call: string; admission: string }>[] = []
  return Object.freeze({
    planInvocation: (call, admission) => {
      planned.push({ call, admission })
    },
    invocationIdentities: {
      newInvocation: () => {
        const next = planned.shift()
        invocations += 1
        const pair = next ?? { call: `call-${invocations}`, admission: `op-${invocations}` }
        return Promise.resolve(
          succeed({
            call: pair.call as ToolCallId,
            admission: pair.admission as ToolOperationId,
          }),
        )
      },
    },
    operationIdentities: {
      newOperation: () => {
        operations += 1
        return Promise.resolve(succeed(`op-cmd-${operations}` as ToolOperationId))
      },
    },
    instanceIdentities: {
      newInstance: () => {
        instances += 1
        return Promise.resolve(succeed(`instance-${instances}` as ToolInstanceId))
      },
    },
  })
}
