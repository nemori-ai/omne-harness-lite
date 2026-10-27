import { expect, it } from 'vitest'
import { judgeAdmit, type ModelCommands } from '@omne-harness/model-contract/provider'
import { createModelRuntime } from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import { callId, fixture, op, unbox } from './memory-fixture.ts'
import { configuration } from './runtime-fixture.ts'

function setup() {
  const f = fixture()
  const assembly = createTestModelDependencies({
    ...f.options,
    start: '2026-10-19T00:00:00Z',
    maxWaiters: 2,
    maxQueued: 10,
    sends: [],
  })
  let schedules = 0
  let sends = 0
  let writes = 0
  const commands = assembly.dependencies.commands
  const recorded: ModelCommands<typeof f.principal> = {
    ...commands,
    admit(input) {
      writes++
      return commands.admit(input)
    },
  }
  const provider = createModelRuntime(
    {
      ...assembly.dependencies,
      commands: recorded,
      instances: {
        ...assembly.dependencies.instances,
        schedule(input) {
          schedules++
          return assembly.dependencies.instances.schedule(input)
        },
      },
      send: {
        ...assembly.dependencies.send,
        send(...args) {
          sends++
          return assembly.dependencies.send.send(...args)
        },
      },
    },
    configuration,
  )
  return { ...f, ...assembly, provider, counts: () => ({ schedules, sends, writes }) }
}
for (const boundary of ['runtime', 'commands'] as const) {
  it(`${boundary} captures input synchronously and rejects malformed input without effects`, async () => {
    const f = setup()
    const calls = boundary === 'runtime' ? f.provider.runtime.calls : f.dependencies.commands
    let getters = 0
    const accessor = Object.defineProperty({ ...f.admit }, 'request', {
      enumerable: true,
      get() {
        getters++
        return f.admit.request
      },
    })
    expect(await calls.admit(accessor)).toEqual({
      failure: { kind: 'invalid', field: '/request', reason: 'accessor' },
    })
    const nested = Object.defineProperty({ ...f.admit.request }, 'profile', {
      enumerable: true,
      get() {
        getters++
        return f.admit.request.profile
      },
    })
    expect(await calls.admit({ ...f.admit, request: nested })).toMatchObject({
      failure: { kind: 'invalid', reason: 'accessor' },
    })
    const invalid = {
      ...f.admit,
      request: { ...f.admit.request, parameters: [{ kind: 'temperature', value: 2.1 }] },
    } satisfies Parameters<typeof calls.admit>[0]
    expect(await calls.admit(invalid)).toEqual({
      failure: { kind: 'invalid', field: '/request/parameters/0/value', reason: 'range' },
    })
    const tenantAccessor = Object.defineProperty({ ...f.admit }, 'tenant', {
      enumerable: true,
      get() {
        getters++
        return f.tenant
      },
    })
    expect(await calls.admit(tenantAccessor)).toEqual({
      failure: { kind: 'invalid', field: '/tenant', reason: 'accessor' },
    })
    const hiddenTenant = Object.defineProperty({ ...f.admit }, 'tenant', {
      enumerable: false,
      value: f.tenant,
    })
    expect(await calls.admit(hiddenTenant)).toEqual({
      failure: { kind: 'invalid', field: '/tenant', reason: 'non-enumerable' },
    })
    let tenantReflections = 0
    const unreadableTenant = new Proxy(
      { ...f.admit },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'tenant') {
            tenantReflections++
            throw new Error('synth-tenant-reflection')
          }
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
      },
    )
    expect(await calls.admit(unreadableTenant)).toEqual({
      failure: { kind: 'invalid', field: '/tenant', reason: 'unreadable' },
    })
    expect(tenantReflections).toBe(1)
    expect(await calls.admit({ ...f.admit, tenant: structuredClone(f.tenant) })).toEqual({
      failure: { kind: 'denied', action: 'tenant' },
    })
    expect(getters).toBe(0)
    expect(f.counts()).toEqual({ writes: 0, schedules: 0, sends: 0 })
    expect(f.controls.instances.queued()).toEqual([])
    expect(await f.dependencies.commands.query(f.admit)).toEqual({ ok: { kind: 'not-committed' } })
    expect(
      await f.dependencies.commands.recall({ ...f.admit, admission: f.admit.operation }),
    ).toEqual({ ok: { kind: 'not-accepted', operation: f.admit.operation } })
    // A capacity exactly filling the pool still fits after the rejected submissions.
    const raw = {
      ...f.admit,
      request: structuredClone(f.admit.request),
      capacity: { ...f.options.limits.capacity },
    }
    const pending = calls.admit(raw)
    Object.defineProperty(raw.request.profile, 'name', { value: 'after-call' })
    raw.capacity.bytes = '1'
    const accepted = unbox(await pending)
    const stored = unbox(await f.dependencies.commands.loadRecovery(f.admit))
    expect(stored.request.profile.name).toBe(f.admit.request.profile.name)
    expect(stored.capacity).toEqual(f.options.limits.capacity)
    expect(await calls.admit(invalid)).toMatchObject({
      failure: { kind: 'invalid', reason: 'range' },
    })
    expect(
      await calls.admit({
        ...f.admit,
        capacity: f.options.limits.capacity,
        request: { ...f.admit.request, fallback: true },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    const replay = unbox(await calls.admit({ ...f.admit, capacity: f.options.limits.capacity }))
    expect(replay).toEqual({ ...accepted, recovered: true })
    expect(
      await calls.admit({ ...f.admit, call: callId('second'), operation: op('second') }),
    ).toMatchObject({ failure: { kind: 'capacity' } })
    expect(f.counts().sends).toBe(0)
  })
}
it('preserves an opaque non-frozen principal recognized by the real qualification adapter', async () => {
  const f = setup()
  const principal = {
    subject: 'trusted' as const,
    marker: 0,
    opaque() {
      return true
    },
  }
  Object.defineProperty(principal, 'secret', {
    get() {
      throw new Error('opaque identity')
    },
  })
  const authorize = f.options.authority.authorize
  f.options.authority.authorize = input =>
    authorize({
      ...input,
      access: {
        ...input.access,
        principal: input.access.principal === principal ? f.principal : input.access.principal,
      },
    })
  const input = { ...f.admit, principal }
  const checked = unbox(judgeAdmit(input))
  expect(checked.principal).toBe(principal)
  expect(checked.tenant).toBe(f.tenant)
  expect(Object.isFrozen(principal)).toBe(false)
  unbox(await f.provider.runtime.calls.admit(input))
  principal.marker = 1
  expect(unbox(await f.provider.runtime.calls.admit(input)).recovered).toBe(true)
})
