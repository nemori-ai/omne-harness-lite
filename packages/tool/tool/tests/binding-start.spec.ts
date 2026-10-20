import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import { completedFinal } from '@omne-harness/tool-contract/testing'
import { admission, evidence, ok, operationId } from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  toStarting,
  writeContext,
  type StartOptions,
} from './start-values.ts'

const refused = () =>
  fail<ToolFailure>({ kind: 'unavailable', dependency: 'executor', diagnostic: 'launch refused' })

afterEach(auditQueues)

describe('21 binding start outcomes', () => {
  it('21 failure: a proved unstarted failure is excluded and settled before the next call starts', async () => {
    let calls = 0
    const harness = startHarness({
      bindingPort: base => ({
        ...base,
        start: (input, environment) => {
          calls += 1
          return input.call === 'c1' ? Promise.resolve(refused()) : base.start(input, environment)
        },
      }),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.drive('c1', 'c2')
    await harness.drive('c1', 'c2')
    expect(calls).toBe(2)
    expect(harness.authority.excluded).toEqual(['c1'])
    expect(await harness.state('c1')).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'unavailable' },
      effect: { kind: 'not-started' },
      queue: { kind: 'released' },
      delivery: { kind: 'pending' },
    })
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.result).not.toBeNull()
    expect(recovery.tasks.map(task => task.kind)).toEqual(['deliver'])
    expect(harness.binding.controls.launches()).toBe(1)
    expect((await harness.state('c2')).phase).toBe('running')
  })

  it('21 unknown: the original binding is queried without a second start', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    harness.authority.uncertain('c1')
    await harness.drive('c1')
    expect(harness.binding.inspected.map(start => start.operation)).toEqual(['op-c1/start'])
    expect(harness.binding.controls.launches()).toBe(0)
    expect(await harness.state('c1')).toMatchObject({ phase: 'starting', queue: { kind: 'held' } })
  })
})

it('21 launch: repeated runs and a new driver keep one actual memory execution', async () => {
  const first = startHarness()
  await admitCall(first, 'c1')
  await first.drive('c1', 'c1')
  const next = startHarness({
    memory: first.memory,
    authority: first.authority,
    binding: first.binding,
  })
  await next.drive('c1')
  expect(first.binding.controls.launches()).toBe(1)
  expect(first.binding.capsules).toEqual([evidence('capsule-c1')])
  expect(first.authority.consumed).toEqual(['c1'])
  expect(await next.state('c1')).toMatchObject({ phase: 'running', queue: { kind: 'held' } })
})

for (const landed of [false, true]) {
  it(`21 receipt: a new driver recalls recordStart when the lost commit landed=${landed}`, async () => {
    let lose = true
    const first = startHarness({
      commands: base => ({
        ...base,
        recordStart: async input => {
          if (lose && input.operation === 'op-c1/started') {
            lose = false
            if (landed) ok(await base.recordStart(input))
            return fail({ kind: 'unavailable', dependency: 'ledger', diagnostic: 'receipt lost' })
          }
          return base.recordStart(input)
        },
      }),
    })
    await admitCall(first, 'c1')
    await first.drive('c1')
    expect((await first.state('c1')).phase).toBe(landed ? 'running' : 'starting')
    const next = startHarness({
      memory: first.memory,
      authority: first.authority,
      binding: first.binding,
    })
    await next.drive('c1')
    expect(next.binding.controls.launches()).toBe(1)
    expect(next.binding.attempts).toEqual(['c1'])
    expect(await next.state('c1')).toMatchObject({ phase: 'running', queue: { kind: 'held' } })
  })
}

for (const fault of ['failure', 'throw'] as const) {
  it(`21 accepted: ${fault} after actual launch recalls acceptance and keeps the slot`, async () => {
    const harness = startHarness({
      bindingPort: base => ({
        ...base,
        start: async (input, environment) => {
          ok(await base.start(input, environment))
          if (fault === 'throw') throw new Error('binding reply lost after launch')
          return refused()
        },
      }),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.drive('c1', 'c2')
    await harness.drive('c1')
    expect(harness.binding.controls.launches()).toBe(1)
    expect(harness.authority.excluded).toEqual([])
    expect(await harness.state('c1')).toMatchObject({ phase: 'running', queue: { kind: 'held' } })
    expect((await harness.state('c2')).phase).toBe('queued')
  })
}

for (const lookup of ['live', 'unknown', 'failure', 'throw', 'lost', 'settled'] as const) {
  it(`21 lookup: authority unknown queries original ${lookup} without releasing or starting again`, async () => {
    let obscure = () => {}
    const seen: string[] = []
    const first = startHarness({
      bindingPort: base => ({
        ...base,
        start: async (input, environment) => {
          const live = await base.start(input, environment)
          obscure()
          return live
        },
        inspectStart: async input => {
          seen.push(input.start.operation)
          if (lookup === 'failure') return refused()
          if (lookup === 'throw') throw new Error('lookup unavailable')
          return base.inspectStart(input)
        },
      }),
    })
    obscure = () => first.authority.uncertain('c1')
    await admitCall(first, 'c1')
    await first.drive('c1')
    const recovery = ok(await first.commands.loadRecovery(admission('c1', 'op-c1')))
    if (recovery.start?.kind !== 'start') throw new Error('no original start')
    if (lookup === 'unknown') first.binding.controls.blindInspection(recovery.start)
    if (lookup === 'lost') await first.binding.controls.loseContinuity(recovery.start)
    if (lookup === 'settled') await first.binding.controls.finish(recovery.start, completedFinal())
    const next = startHarness({
      memory: first.memory,
      authority: first.authority,
      binding: first.binding,
    })
    await next.drive('c1')
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(new Set(seen)).toEqual(new Set(['op-c1/start']))
    expect(next.binding.controls.launches()).toBe(1)
    expect(await next.state('c1')).toMatchObject({ phase: 'starting', queue: { kind: 'held' } })
    expect(
      ok(await next.commands.loadRecovery(admission('c1', 'op-c1'))).tasks.map(task => task.kind),
    ).toEqual(['start'])
    first.authority.reveal('c1')
    await next.drive('c1')
    expect(await next.state('c1')).toMatchObject({ phase: 'running', queue: { kind: 'held' } })
    expect(next.binding.controls.launches()).toBe(1)
  })
}

for (const fault of ['unavailable', 'conflict', 'throw', 'lost-receipt'] as const) {
  it(`21 exclusion: ${fault} retains responsibility across drivers and retries only exclusion`, async () => {
    let attempts = 0
    let failing = true
    const exclusions: string[] = []
    const authorityPort: NonNullable<StartOptions['authorityPort']> = base => ({
      ...base,
      exclude: async input => {
        exclusions.push(input.operation)
        if (!failing) return base.exclude(input)
        if (fault === 'lost-receipt') ok(await base.exclude(input))
        if (fault === 'throw') throw new Error('exclude response lost')
        return fault === 'conflict'
          ? fail({ kind: 'conflict', operation: input.operation })
          : refused()
      },
    })
    const first = startHarness({
      authorityPort,
      bindingPort: base => ({
        ...base,
        start: () => {
          attempts += 1
          return Promise.resolve(refused())
        },
      }),
    })
    await admitCall(first, 'c1')
    await first.drive('c1')
    expect((await first.state('c1')).phase).toBe('starting')
    expect(first.binding.controls.launches()).toBe(0)
    const marker = ok(
      await first.runtime.queryOperation({
        ...admission('c1', 'op-c1'),
        operation: operationId('op-c1/start-failed'),
      }),
    )
    expect(marker.kind).toBe('committed')
    const next = startHarness({
      memory: first.memory,
      authority: first.authority,
      binding: first.binding,
      authorityPort,
    })
    await next.drive('c1')
    expect(attempts).toBe(1)
    if (fault !== 'lost-receipt') {
      expect(await next.state('c1')).toMatchObject({ phase: 'starting', queue: { kind: 'held' } })
      failing = false
      await next.drive('c1')
    }
    expect(new Set(exclusions)).toEqual(new Set(['op-c1/exclude']))
    expect(await next.state('c1')).toMatchObject({
      phase: 'settled',
      effect: { kind: 'not-started' },
      queue: { kind: 'released' },
    })
    expect(attempts).toBe(1)
  })
}

for (const answer of ['unknown', 'failure', 'throw'] as const) {
  it(`21 marker: an ${answer} failure receipt never authorizes a launch`, async () => {
    const harness = startHarness({
      readsPort: base => ({
        ...base,
        operation: () => {
          if (answer === 'throw') throw new Error('receipt store down')
          return Promise.resolve(answer === 'unknown' ? succeed({ kind: 'unknown' }) : refused())
        },
      }),
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    expect(harness.binding.controls.launches()).toBe(0)
    expect(await harness.state('c1')).toMatchObject({ phase: 'starting', queue: { kind: 'held' } })
  })
}

for (const fault of ['unavailable', 'stale-revision', 'commit-unknown'] as const) {
  it(`21 marker: ${fault} before the marker lands retries its original write without another binding call`, async () => {
    let failures = 2
    let attempts = 0
    const markerWrites: string[] = []
    const harness = startHarness({
      bindingPort: base => ({
        ...base,
        start: () => {
          attempts += 1
          return Promise.resolve(refused())
        },
      }),
      commands: base => ({
        ...base,
        recordStart: input => {
          if (input.operation === 'op-c1/start-failed') {
            markerWrites.push(input.operation)
            if (failures-- > 0)
              return Promise.resolve(
                fault === 'stale-revision'
                  ? fail({ kind: 'stale-revision', current: input.expected })
                  : fault === 'commit-unknown'
                    ? fail({ kind: 'commit-unknown', operation: input.operation })
                    : refused(),
              )
          }
          return base.recordStart(input)
        },
      }),
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    await harness.drive('c1')
    await harness.drive('c1')
    expect(attempts).toBe(1)
    expect(markerWrites).toEqual(Array(3).fill('op-c1/start-failed'))
    expect((await harness.state('c1')).phase).toBe('settled')
    expect(harness.binding.controls.launches()).toBe(0)
  })
}

it('21 marker: a negative receipt read excludes an in-flight marker, whose original write is retried', async () => {
  let intercepted = false
  let attempts = 0
  let queryMarker = async () => {}
  const harness = startHarness({
    bindingPort: base => ({
      ...base,
      start: () => {
        attempts += 1
        return Promise.resolve(refused())
      },
    }),
    store: memory => ({
      ...memory,
      read: domain => memory.read(domain),
      commit: async input => {
        const isMarker = input.writes.some(
          write =>
            write.kind === 'put' &&
            write.record.kind === 'operation' &&
            write.record.operation.operation === 'op-c1/start-failed',
        )
        if (isMarker && !intercepted) {
          intercepted = true
          await queryMarker()
        }
        return memory.commit(input)
      },
    }),
  })
  queryMarker = async () => {
    const reply = ok(
      await harness.runtime.queryOperation({
        ...admission('c1', 'op-c1'),
        operation: operationId('op-c1/start-failed'),
      }),
    )
    expect(reply.kind).toBe('not-committed')
  }
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  expect(intercepted).toBe(true)
  expect(attempts).toBe(1)
  expect((await harness.state('c1')).phase).toBe('settled')
})

for (const port of ['resolve', 'prepare', 'environment'] as const) {
  it(`21 ports: ${port} failure before binding.start stays retryable without a permanent refusal`, async () => {
    let failing = true
    const harness = startHarness({
      bindingsPort: base => ({
        ...base,
        resolve: input =>
          port === 'resolve' && failing ? Promise.resolve(refused()) : base.resolve(input),
      }),
      authorityPort: base => ({
        ...base,
        prepare: input =>
          port === 'prepare' && failing ? Promise.resolve(refused()) : base.prepare(input),
      }),
      environment: port === 'environment' ? new Map([['c1', 'unavailable']]) : new Map(),
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    expect(harness.binding.controls.launches()).toBe(0)
    expect(harness.authority.excluded).toEqual([])
    expect((await harness.state('c1')).phase).not.toBe('settled')
    failing = false
    harness.environments.answer('c1', 'prepared')
    await harness.drive('c1')
    expect(harness.binding.controls.launches()).toBe(1)
    expect((await harness.state('c1')).phase).toBe('running')
  })
}

it('21 contradiction: a live handle with a not-started authority is retained without exclusion or resend', async () => {
  let lie = false
  const first = startHarness({
    authorityPort: base => ({
      ...base,
      inspect: input =>
        lie
          ? Promise.resolve(succeed({ kind: 'not-started', exclusion: evidence('contradiction') }))
          : base.inspect(input),
    }),
    bindingPort: base => ({
      ...base,
      start: async (input, environment) => {
        const live = await base.start(input, environment)
        lie = true
        return live
      },
    }),
  })
  await admitCall(first, 'c1')
  await first.drive('c1')
  await first.drive('c1')
  expect(first.binding.controls.launches()).toBe(1)
  expect(first.binding.attempts).toEqual(['c1'])
  expect(first.authority.excluded).toEqual([])
  expect(await first.state('c1')).toMatchObject({ phase: 'starting', queue: { kind: 'held' } })
})

it('21 crash window: without a committed failure marker, a new driver can obtain only the original start first acceptance', async () => {
  const permits: string[] = []
  const starts: string[] = []
  const first = startHarness({
    bindingPort: base => ({
      ...base,
      start: (input, environment) => {
        permits.push(input.permit.request.revision)
        starts.push(input.start.operation)
        return permits.length === 1 ? Promise.resolve(refused()) : base.start(input, environment)
      },
    }),
    commands: base => ({
      ...base,
      recordStart: input =>
        input.operation === 'op-c1/start-failed'
          ? Promise.resolve(refused())
          : base.recordStart(input),
    }),
  })
  await admitCall(first, 'c1')
  await first.drive('c1')
  expect(first.binding.controls.launches()).toBe(0)
  expect(
    ok(
      await first.runtime.queryOperation({
        ...admission('c1', 'op-c1'),
        operation: operationId('op-c1/start-failed'),
      }),
    ).kind,
  ).toBe('not-committed')
  const next = startHarness({
    memory: first.memory,
    authority: first.authority,
    binding: first.binding,
  })
  await next.drive('c1')
  await next.drive('c1')
  expect(starts).toEqual(['op-c1/start', 'op-c1/start'])
  expect(permits).toEqual(['1', '2'])
  expect(first.authority.consumed).toEqual(['c1'])
  expect(first.authority.excluded).toEqual([])
  expect(next.binding.controls.launches()).toBe(1)
  expect(await next.state('c1')).toMatchObject({ phase: 'running', queue: { kind: 'held' } })
})

it('21 source: an unrelated unknown record is not the driver failure marker', async () => {
  const harness = startHarness()
  await admitCall(harness, 'c1')
  const start = await toStarting(harness, 'c1')
  ok(
    await harness.commands.recordStart({
      ...(await writeContext(harness, 'c1', 'other/unknown')),
      invocation: start,
      outcome: { kind: 'unknown', diagnostic: 'unrelated observer' },
    }),
  )
  await harness.drive('c1')
  expect(harness.authority.excluded).toEqual([])
  expect(harness.binding.controls.launches()).toBe(1)
  expect((await harness.state('c1')).phase).toBe('running')
})

it('21 ports: an unavailable prepared environment reconnect keeps the start retryable', async () => {
  const harness = startHarness()
  await admitCall(harness, 'c1')
  await toStarting(harness, 'c1')
  harness.environments.answer('c1', 'unavailable')
  await harness.drive('c1')
  expect(harness.binding.controls.launches()).toBe(0)
  expect(harness.authority.excluded).toEqual([])
  expect((await harness.state('c1')).phase).toBe('starting')
  harness.environments.answer('c1', 'prepared')
  await harness.drive('c1')
  expect(harness.binding.controls.launches()).toBe(1)
})
