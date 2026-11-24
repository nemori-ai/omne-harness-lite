import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  acquisitionRef,
  originRef,
  type EnvironmentBinding,
  type FacilityKey,
  type ProgramCall,
} from '@omne-harness/execution-environment-contract'
import { createMemoryResourceLedger } from '@omne-harness/execution-environment-contract/testing'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createProgramProvider } from '@omne-harness/execution-environment-program'
import {
  ExecutionEnvironmentRegistry,
  programFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import { testPorts } from './ports.ts'

async function world() {
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  const scope = decodeScopeRef({ ref: 'program-cordis' })
  if (!tenant.ok || !('ok' in scope)) throw new Error('identity fixture')
  const ctx = new Context()
  await testPorts(tenant.value).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  const sandbox = () =>
    ctx.plugin({
      name: 'programSandbox',
      inject: { [executionEnvironmentKey]: { caller: 'provider' as const } },
      apply: (inner: Context) =>
        inner.executionEnvironment.registerProvider(createProgramProvider()),
    })
  const service = ctx.get(executionEnvironmentKey)
  if (service === undefined) throw new Error('service missing')
  const access = { principal: 'test', tenant: tenant.value }
  const origin = originRef('call-1')
  const binding: EnvironmentBinding = { kind: 'stateless_sandbox', scope: scope.ok, origin }
  const placement = (facilities: readonly FacilityKey[] = ['program']) =>
    service.resolvePlacement(access, {
      scope: scope.ok,
      requirement: {
        allowedBindings: [binding],
        facilities,
        isolation: ['restricted-js', 'network-none'],
      },
    })
  return { ctx, sandbox, service, access, origin, binding, scope: scope.ok, placement }
}

it('a placement that needs a restricted program domain resolves only while the declaration and the provider are there', async () => {
  const { ctx, sandbox, placement } = await world()
  expect(await placement()).toMatchObject({ kind: 'rejected' })
  const declaration = await ctx.plugin(programFacilityPlugin)
  expect(await placement()).toMatchObject({ kind: 'rejected' })
  const provider = await sandbox()
  expect(await placement()).toMatchObject({
    kind: 'placement',
    provider: { name: 'program-sandbox' },
    binding: { kind: 'stateless_sandbox' },
  })
  expect(await placement(['program', 'files'])).toMatchObject({ kind: 'rejected' })
  await provider.dispose()
  expect(await placement()).toMatchObject({ kind: 'rejected' })
  await declaration.dispose()
})

it('a program runs through the gate of the registry and its calls come out with their ordinals', async () => {
  const { ctx, sandbox, service, access, origin, binding, scope, placement } = await world()
  await ctx.plugin(programFacilityPlugin)
  const provider = await sandbox()
  const placed = await placement()
  if (placed.kind !== 'placement') throw new Error('expected a placement')
  const guarded: string[] = []
  const acquired = await service.acquire(access, {
    acquisition: acquisitionRef('acq-1'),
    origin,
    scope,
    placement: placed,
    ledger: createMemoryResourceLedger().ledger,
    guard: {
      authorize: async (facility, operation) => {
        guarded.push(`${facility}.${operation}`)
        return 'authorized'
      },
    },
  })
  if (acquired.kind !== 'acquired') throw new Error(`expected a lease, got ${acquired.kind}`)
  const program = acquired.lease.facility('program')
  if (program === undefined) throw new Error('expected the program facility')
  const calls: ProgramCall[] = []
  const answer = await program.run({
    requestId: 'request-1',
    access,
    origin,
    binding,
    source:
      'const [a, b] = await Promise.all([Add.one({ n: 1 }), Add.one({ n: 2 })])\nreturn a.n + b.n',
    input: { kind: 'null' },
    entries: ['Add.one'],
    failures: [],
    limits: { computeMs: 1000, memoryBytes: 32 << 20, outputBytes: 4096, calls: 4 },
    onCall(call) {
      calls.push(call)
      if (answer.kind === 'done')
        answer.value.answer(call.ordinal, { kind: 'value', value: call.argument })
    },
    onIdle: () => undefined,
  })
  if (answer.kind !== 'done') throw new Error(`expected a run, got ${JSON.stringify(answer)}`)
  expect(await answer.value.outcome).toEqual({
    kind: 'returned',
    value: { kind: 'number', lexeme: '3' },
    console: '',
  })
  expect(calls.map(call => [call.ordinal, call.entry])).toEqual([
    [1, 'Add.one'],
    [2, 'Add.one'],
  ])
  expect(guarded).toEqual(['program.run'])
  await acquired.lease.release()
  await provider.dispose()
})
