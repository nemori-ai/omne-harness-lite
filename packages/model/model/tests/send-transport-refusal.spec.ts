import { expect, it } from 'vitest'
import type { ModelTransport } from '@omne-harness/model-contract/provider'
import type { ModelOperationId } from '@omne-harness/model-contract'
import { createModelRuntime } from '../src/runtime.ts'
import { createTestModelDependencies } from '../src/testing/index.ts'
import { createModelSendBoundary } from '../src/send.ts'
import { configuration } from '../acceptance/fixtures/runtime.ts'
import { op, instance, proof, unbox } from './memory-fixture.ts'
import { sendFixture, signal } from './send-fixture.ts'

type Phase = 'prepare' | 'materialize'
type TransportFailure = Extract<
  Awaited<ReturnType<ModelTransport['prepare']>>,
  { failure: unknown }
>['failure']
const PICTURE = { storage: 's', key: 'k', mediaType: 'image/png', bytes: '9', digest: 'd' }
type Kind = 'denied' | 'invalid' | 'unsupported' | 'material-unavailable' | 'over-limit'
async function refusal(phase: Phase, kind: Kind) {
  const f = await sendFixture()
  const media = { kind: 'media', reference: PICTURE } as const
  const failures = {
    denied: { kind: 'denied', action: 'synthetic-transport' },
    invalid: { kind: 'invalid', field: 'synthetic', reason: 'rejected' },
    unsupported: { kind: 'unsupported', field: 'synthetic', adapter: f.request.representation },
    'material-unavailable': { ...media, reason: 'material-unavailable' },
    'over-limit': { ...media, reason: 'over-limit', limit: '4194304' },
  } as const
  const failure = failures[kind] as TransportFailure
  let prepares = 0,
    materializes = 0
  const resources: typeof f.resources = {
    async acquire(input) {
      const acquired = await f.resources.acquire(input)
      if ('failure' in acquired) return acquired
      const resource = acquired.ok
      return {
        ok: {
          ...resource,
          transport: {
            async prepare(...input) {
              prepares += 1
              if (phase === 'prepare') return { failure }
              const prepared = await resource.transport.prepare(...input)
              if ('failure' in prepared) return prepared
              return {
                ok: {
                  ...prepared.ok,
                  materialize: async () => {
                    materializes += 1
                    return { failure }
                  },
                },
              }
            },
          },
        },
      }
    },
  }
  const sender = (commands = f.dependencies.commands) =>
    createModelSendBoundary({
      commands,
      resources,
      coordinator: f.controls.send.coordinator,
      credentials: f.credentials,
      maxRetainedAttempts: 4,
    })
  return { ...f, resources, failure, sender, attempts: () => ({ prepares, materializes }) }
}

for (const phase of ['prepare', 'materialize'] as const)
  for (const [kind, cause] of [
    ['denied', 'excluded'],
    ['invalid', 'input-rejected'],
    ['unsupported', 'modality'],
  ] as const)
    it(`settles zero-start ${phase} ${kind} with ${cause} and no materialization receipt`, async () => {
      const f = await refusal(phase, kind)
      const assembly = createTestModelDependencies({
        ...f.options,
        start: '2026-10-19T00:00:00Z',
        maxWaiters: 2,
        maxQueued: 10,
        sends: [],
        sending: { credentials: f.credentials, sources: [f.source], maxRetainedAttempts: 4 },
      })
      const send = assembly.controls.send.createSender({ resources: f.resources })
      const provider = createModelRuntime({ ...assembly.dependencies, send }, configuration)
      unbox(await provider.runtime.calls.admit(f.admit))
      const result = await provider.driver.drive(
        {
          ...f.admit,
          operation: op('claim'),
          instance: instance(),
          continuity: proof(f.admit.call),
        },
        signal(),
      )
      expect(result).toEqual({ ok: undefined })
      expect(unbox(await assembly.dependencies.commands.loadRecovery(f.admit)).state).toMatchObject(
        {
          phase: 'settled',
          settlement: { termination: { kind: 'failed', fault: { cause, upstreamStatus: null } } },
        },
      )
      expect(unbox(await assembly.dependencies.commands.dispatches(f.admit))[0]).toMatchObject({
        send: 'not-sent',
        firstContent: 'none-proven',
        materialization: null,
        terminal: { kind: 'failed', fault: { cause } },
      })
      expect(f.counts()).toMatchObject({ starts: 0, acquired: 1 })
      expect(f.attempts()).toEqual({ prepares: 1, materializes: phase === 'materialize' ? 1 : 0 })
      expect(f.events).toEqual(phase === 'materialize' ? ['prepared', 'resource'] : ['resource'])
    })

it.each([
  [
    'material-unavailable',
    { cause: 'input-rejected', diagnostic: 'material-unavailable', upstreamStatus: null },
  ],
  [
    'over-limit',
    {
      cause: 'input-over-limit',
      diagnostic: 'media-over-limit',
      upstreamStatus: null,
      reported: { metric: 'image-bytes', limit: '4194304', actual: null },
    },
  ],
] as const)(
  'a medium that is %s at materialization ends the call with its own cause, never as a modality',
  async (kind, fault) => {
    const f = await refusal('materialize', kind)
    const assembly = createTestModelDependencies({
      ...f.options,
      start: '2026-10-19T00:00:00Z',
      maxWaiters: 2,
      maxQueued: 10,
      sends: [],
      sending: { credentials: f.credentials, sources: [f.source], maxRetainedAttempts: 4 },
    })
    const send = assembly.controls.send.createSender({ resources: f.resources })
    const provider = createModelRuntime({ ...assembly.dependencies, send }, configuration)
    unbox(await provider.runtime.calls.admit(f.admit))
    const result = await provider.driver.drive(
      { ...f.admit, operation: op('claim'), instance: instance(), continuity: proof(f.admit.call) },
      signal(),
    )
    expect(result).toEqual({ ok: undefined })
    const { state } = unbox(await assembly.dependencies.commands.loadRecovery(f.admit))
    expect(state).toMatchObject({
      phase: 'settled',
      settlement: { termination: { kind: 'failed', fault } },
    })
    expect(f.counts()).toMatchObject({ starts: 0 })
  },
)

for (const method of ['openReceiveWindow', 'recordSend', 'preserve'] as const)
  it(`recovers the original ${method} after a committed write throws without preparing again`, async () => {
    const f = await refusal('prepare', 'invalid')
    const original = f.dependencies.commands
    const writes: unknown[] = []
    const queries: unknown[] = []
    const commands: typeof original = {
      ...original,
      async query(input) {
        queries.push(input.operation)
        return original.query(input)
      },
    }
    function loseReceipt<A extends { operation: ModelOperationId }, T extends object>(
      run: (input: A) => Promise<T>,
    ) {
      return async (input: A): Promise<T> => {
        writes.push(structuredClone(input))
        const result = await run(input)
        if (writes.length === 1 && 'ok' in result) throw new Error('synthetic-lost-receipt')
        return result
      }
    }
    if (method === 'preserve') commands.preserve = loseReceipt(original.preserve)
    else if (method === 'recordSend') commands.recordSend = loseReceipt(original.recordSend)
    else commands.openReceiveWindow = loseReceipt(original.openReceiveWindow)
    const send = f.sender(commands)
    expect(await send.send(f.demand, signal())).toMatchObject({ kind: 'unknown' })
    expect(await send.send(f.demand, signal())).toMatchObject({
      kind: 'not-started',
      failure: f.failure,
    })
    expect(writes).toHaveLength(2)
    expect(writes[1]).toEqual(writes[0])
    expect(queries).toEqual([(writes[0] as { operation: unknown }).operation])
    expect(f.attempts()).toEqual({ prepares: 1, materializes: 0 })
    expect(f.counts().starts).toBe(0)
    expect(unbox(await original.dispatches(f.admit))[0]?.terminal).toMatchObject({
      kind: 'failed',
      fault: { cause: 'input-rejected' },
    })
  })

for (const outcome of ['unavailable', 'throw'] as const)
  it(`keeps the refusal when its revision read answers ${outcome} once`, async () => {
    const f = await refusal('materialize', 'unsupported')
    const commands = f.dependencies.commands
    let reads = 0
    const send = f.sender({
      ...commands,
      async loadRecovery(input) {
        reads += 1
        if (reads === 1) {
          if (outcome === 'throw') throw new Error('synthetic-read')
          return { failure: { kind: 'unavailable', dependency: 'synthetic', diagnostic: 'read' } }
        }
        return commands.loadRecovery(input)
      },
    })
    expect(await send.send(f.demand, signal())).toMatchObject({ kind: 'unknown' })
    expect(await send.send(f.demand, signal())).toMatchObject({
      kind: 'not-started',
      failure: f.failure,
    })
    expect(f.attempts()).toEqual({ prepares: 1, materializes: 1 })
    expect(f.counts().starts).toBe(0)
    expect(unbox(await commands.dispatches(f.admit))[0]?.terminal).toMatchObject({
      kind: 'failed',
      fault: { cause: 'modality' },
    })
  })

it('does not write a terminal with revoked execution authority', async () => {
  const f = await refusal('prepare', 'invalid')
  const commands = f.dependencies.commands
  const send = f.sender({
    ...commands,
    async loadRecovery(input) {
      const current = await commands.loadRecovery(input)
      f.setTrustedExecution(false)
      return current
    },
  })
  expect(await send.send(f.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { kind: 'denied' },
  })
  expect(unbox(await commands.dispatches(f.admit))[0]?.terminal).toBeNull()
  expect(f.counts().starts).toBe(0)
  expect(f.events).toEqual(['resource'])
})

it('keeps the final refusal and retained attempt when resource release fails', async () => {
  const f = await refusal('materialize', 'invalid')
  f.releaseFailures.add('prepared')
  const send = f.sender()
  expect(await send.send(f.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: f.failure,
  })
  expect(unbox(await f.dependencies.commands.dispatches(f.admit))[0]?.terminal).toMatchObject({
    kind: 'failed',
    fault: { cause: 'input-rejected' },
  })
  expect(await send.send(f.demand, signal())).toMatchObject({
    kind: 'unknown',
    diagnostic: 'resource-release-failed',
  })
  expect(f.attempts()).toEqual({ prepares: 1, materializes: 1 })
  expect(f.counts()).toMatchObject({ starts: 0, acquired: 1 })
})
