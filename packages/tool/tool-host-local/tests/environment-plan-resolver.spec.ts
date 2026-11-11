// The plan of one preparation (`createLocalEnvironmentPlanResolver`): the current Tool qualification,
// the scope binding of the caller, the requirement and the placement the Execution authority gives.
// Every refusal names its cause: a refused or unknown placement answers `unavailable` with the
// reason the authority gave, so that the run-stop log of the executor shows why a call does not move.
import { describe, expect, it } from 'vitest'
import {
  originRef,
  type EnvironmentRequirement,
  type ExecutionEnvironment,
  type Placement,
} from '@omne-harness/execution-environment-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import type { PreparationRecord } from '@omne-harness/tool-contract/provider'
import {
  createLocalEnvironmentPlanResolver,
  type LocalEnvironmentPlanInput,
} from '../src/execution-environment.ts'
import {
  adoption,
  callId,
  operationId,
  principalA,
  request,
  tenantA,
  type Principal,
} from './coordinator-values.ts'

const requirement: EnvironmentRequirement = {
  allowedBindings: [{ kind: 'host_machine' }],
  facilities: ['files', 'command'],
  isolation: [],
}
const placement: Placement = {
  kind: 'placement',
  binding: { kind: 'host_machine' },
  provider: { name: 'fixture', version: '1', generation: '1' },
  quotaDomain: 'fixture',
  continuity: { kind: 'not_guaranteed' },
  requirement,
}
const preparation: PreparationRecord = {
  tenant: tenantA,
  call: callId('call-1'),
  operation: operationId('prepare-1'),
  adoption: adoption('environment'),
  inputDigest: 'input-1',
  purpose: 'initial',
  request: request(),
}
const prepare = { tenant: tenantA, principal: principalA, call: preparation.call, preparation }
const facts = { system: 'fixture', release: '1', architecture: 'fixture', facilities: [] }

type Placed = Awaited<ReturnType<ExecutionEnvironment<Principal>['resolvePlacement']>>
type Qualified = Awaited<ReturnType<LocalEnvironmentPlanInput<Principal>['access']['qualify']>>

/** The resolver over stand-ins; `changes` replaces what one source answers. */
function resolver(
  changes: Readonly<{
    qualified?: Qualified['kind']
    scope?: PreparationRecord['request']['requesterScope']
    placed?: Placed
  }> = {},
) {
  let ledgers = 0
  const built = createLocalEnvironmentPlanResolver<Principal>({
    execution: {
      resolvePlacement: async () => changes.placed ?? placement,
    } as unknown as ExecutionEnvironment<Principal>,
    access: {
      qualify: async () => ({ kind: changes.qualified ?? 'allowed' }) as Qualified,
    } as LocalEnvironmentPlanInput<Principal>['access'],
    requirement: async () => succeed(requirement),
    binding: async () =>
      succeed({
        origin: originRef('caller'),
        scope: changes.scope ?? preparation.request.requesterScope,
      }),
    guard: { authorize: async () => 'authorized' as const },
    ledger: async () => {
      ledgers += 1
      return {} as never
    },
    facts: async () => succeed(facts as never),
  })
  return { resolve: () => built.resolve(prepare), ledgers: () => ledgers }
}

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable', dependency: 'execution-environment-adapter', diagnostic })

describe('the plan of a preparation', () => {
  it('gives the placement and the scope of the request, and builds the ledger of a preparation once', async () => {
    const r = resolver()
    const first = await r.resolve()
    expect(first).toMatchObject({
      ok: {
        acquire: { placement, scope: preparation.request.requesterScope },
        facts,
      },
    })
    await r.resolve()
    expect(r.ledgers()).toBe(1)
  })

  it('denies a caller the Tool qualification denies, and is unavailable when it cannot tell', async () => {
    expect(await resolver({ qualified: 'denied' }).resolve()).toEqual(
      fail({ kind: 'denied', action: 'environment' }),
    )
    expect(await resolver({ qualified: 'unavailable' as never }).resolve()).toEqual(
      unavailable('current tool qualification unavailable'),
    )
  })

  it('denies a binding whose scope is not the scope of the request', async () => {
    const other = { ...preparation.request.requesterScope, ref: 'session-scope:other' }
    expect(await resolver({ scope: other as never }).resolve()).toEqual(
      fail({ kind: 'denied', action: 'environment-scope' }),
    )
  })

  it('names the reason of a refused placement and the cause of an unknown one', async () => {
    expect(
      await resolver({ placed: { kind: 'rejected', reason: 'noMatchingEnvironment' } }).resolve(),
    ).toEqual(unavailable('placement rejected: noMatchingEnvironment'))
    expect(
      await resolver({ placed: { kind: 'unknown', cause: 'authority' } as Placed }).resolve(),
    ).toEqual(unavailable('placement unknown: authority'))
  })

  it('refuses a placement that answers another requirement than the one asked', async () => {
    const other = { ...placement, requirement: { ...requirement, facilities: ['files'] } }
    expect(await resolver({ placed: other as Placed }).resolve()).toEqual(
      unavailable('placement requirement mismatch'),
    )
  })
})
