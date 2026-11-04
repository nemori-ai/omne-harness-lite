import { expect, it } from 'vitest'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelInitialRun,
  createModelObservationStorage,
  modelCommands,
} from '../src/commands/index.ts'
import { MemoryState } from '../src/testing/state.ts'
import { adoption, fixture, identity, instance, op, unbox } from './memory-fixture.ts'

// Refusals of the first-execution channel: continuity is only the bound record's own, for its own
// stored call, and prepare refuses a record that a successor or another call took over.

type Continuity = Parameters<ReturnType<typeof createModelInitialExecution>['continuity']>[0]

function claimed() {
  const f = fixture()
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords: 8, maxBindings: 2, maxCallsPerBinding: 2 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const memory = new MemoryState(f.options)
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    initialRun: run,
    report: () => {},
  })
  const seen: Continuity[] = []
  let initial: ReturnType<typeof createModelInitialExecution<typeof f.principal>>
  const core = createModelCommandsCore(
    {
      ...f.options,
      initialRun: run,
      evidence: f.options.evidence.map(e => ({
        ...e,
        continuity: input => {
          seen.push({ ...input })
          return initial.continuity(input)
        },
      })),
    },
    bridge.storage,
  )
  initial = createModelInitialExecution({ run, core })
  const access = { tenant: f.tenant, principal: f.principal, call: f.admit.call }
  const key = core.identity(access)
  if (typeof key !== 'string') throw new Error('fixture tenant')
  return { f, memory, initial, commands: modelCommands(core), access, key, seen }
}

async function boundContinuity() {
  const t = claimed()
  unbox(await t.commands.admit(t.f.admit))
  const channel = unbox(t.initial.openHost({ instance: instance() }))
  unbox(await channel.commands.claim(unbox(await channel.prepare(t.access))))
  const input = t.seen.at(-1)
  if (!input) throw new Error('fixture continuity')
  return { ...t, channel, input }
}

it('confirms the continuity that the bound claim itself presented', async () => {
  const t = await boundContinuity()
  expect(t.initial.continuity(t.input)).toEqual({ ok: t.input.source })
})

it.each([
  ['another successor', (i: Continuity) => ({ ...i, successor: instance('other') })],
  ['another source record', (i: Continuity) => ({ ...i, source: { ...i.source, record: 'x' } })],
  [
    'an execution already named',
    (i: Continuity) => ({
      ...i,
      execution: { tenant: i.tenant, call: i.call, instance: instance(), generation: '1' },
    }),
  ],
  ['another consumer', (i: Continuity) => ({ ...i, consumer: { ...i.consumer, work: 'other' } })],
  [
    'another request',
    (i: Continuity) => ({
      ...i,
      request: { ...i.request, fallback: !i.request.fallback },
    }),
  ],
])('denies continuity for %s', async (_name, vary) => {
  const t = await boundContinuity()
  expect(t.initial.continuity(vary(t.input))).toEqual({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
})

it('denies continuity once the binding closed', async () => {
  const t = await boundContinuity()
  t.channel.close()
  expect(t.initial.continuity(t.input)).toEqual({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
})

it.each([
  ['another admission', { admission: op('other') }],
  ['another evidence adoption', { owner: { evidence: { ...adoption, revision: 'other' } } }],
] as const)('denies continuity when the stored call has %s', async (_name, change) => {
  const t = await boundContinuity()
  const call = t.memory.documents(t.key).calls.get(t.access.call)
  if (!call) throw new Error('fixture call')
  const owner = 'owner' in change ? { ...call.owner, ...change.owner } : call.owner
  const admission = 'admission' in change ? change.admission : call.admission
  t.memory.publish(t.key, { ...call, owner, admission })
  expect(t.initial.continuity(t.input)).toEqual({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
})

it('denies continuity of a tenant that does not hold the record', async () => {
  const t = await boundContinuity()
  expect(t.initial.continuity({ ...t.input, tenant: identity('6') })).toMatchObject({
    failure: { kind: 'denied' },
  })
})

it('refuses to bind a first execution when the stored call already names one or lost its body', async () => {
  for (const change of ['execution', 'request'] as const) {
    const t = claimed()
    unbox(await t.commands.admit(t.f.admit))
    const call = t.memory.documents(t.key).calls.get(t.access.call)
    if (!call) throw new Error('fixture call')
    t.memory.publish(
      t.key,
      change === 'execution'
        ? {
            ...call,
            execution: {
              tenant: t.f.tenant,
              call: call.state.call,
              instance: instance(),
              generation: '1',
            },
          }
        : { ...call, request: null },
    )
    const channel = unbox(t.initial.openHost({ instance: instance() }))
    expect(await channel.prepare(t.access)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'successor-unavailable' },
    })
  }
})

it('bounds first bindings per channel and keeps refusing once the binding closed', async () => {
  const t = claimed()
  const calls = [t.f.admit.call, ...['two', 'three'].map(s => `mcall_${s}`)]
  const channel = unbox(t.initial.openHost({ instance: instance() }))
  const results = []
  for (const [index, call] of calls.entries()) {
    const admit =
      index === 0
        ? t.f.admit
        : { ...t.f.admit, call: call as typeof t.f.admit.call, operation: op(`n${index}`) }
    unbox(await t.commands.admit(admit))
    results.push(await channel.prepare({ ...t.access, call: admit.call }))
  }
  expect(results[0]).toHaveProperty('ok')
  expect(results[1]).toHaveProperty('ok')
  expect(results[2]).toMatchObject({ failure: { diagnostic: 'call-capacity' } })
  channel.close()
  expect(await channel.prepare(t.access)).toEqual({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
})
