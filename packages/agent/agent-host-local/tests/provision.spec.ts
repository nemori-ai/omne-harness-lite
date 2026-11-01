// The instance provision of the `agent-host` plugin on real Cordis 4.0.4: the conformance suite of
// agent-cordis-contract `./testing` against the real host, then the host rules that the suite does
// not hold (agent-cordis-contract docs/cordis.md "实例的取得与回收"): the guard point of the reclaim,
// a quiesce that fails or leaves work unresolved, a reserve that grants nothing, an old withdrawal
// that leaves the successor, and a withdrawal from a fiber that is not the host's.
//
// The suite runs with `withRuntimeDuties` (see host-support.ts): the plain factory answers quiesce
// `unavailable` until #502 stage 5, so its instances are never reclaimed. The cases named "plain
// factory" show that answer and the host's handling of it.
import {
  decodeAgentOperationId,
  decodeAgentRegistrationId,
  type AgentInstanceId,
} from '@omne-harness/agent-contract'
import { agentInstanceProvisionConformance } from '@omne-harness/agent-cordis-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HOST_PRINCIPAL,
  IDLE_MS,
  caller,
  definitions,
  ok,
  occupied,
  openWorld,
  scope,
  slotOf,
  turns,
  type World,
} from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

async function world(factory: 'plain' | 'duties'): Promise<World> {
  const made = await openWorld({ factory })
  opened.push(made)
  return made
}

/** Waits until the directory reported the end of the instance, or fails after many turns. */
async function retiredOf(world: World, instance: AgentInstanceId): Promise<string> {
  for (let turn = 0; turn < 50; turn += 1) {
    const found = world.retired.find(entry => entry.instance === instance)
    if (found !== undefined) return found.reason
    await turns(1)
  }
  throw new Error(`${instance} was never retired`)
}

const operation = (text: string) => ok(decodeAgentOperationId(text))

describe('agentInstanceProvisionConformance against the host plugin', () => {
  const cases = agentInstanceProvisionConformance<string>(async () => {
    const made = await openWorld({ factory: 'duties' })
    const published = new Set<AgentInstanceId>()
    const provision = made.provision
    return {
      provision: {
        async acquire(input) {
          const answer = await provision.acquire(input)
          if ('ok' in answer) published.add(answer.ok.instance)
          return answer
        },
      },
      directory: made.directory,
      access: caller,
      slot: variant => ({ scope, definition: definitions[variant] }),
      async idleOut(instance) {
        made.handles.get(instance)?.report({ state: { kind: 'idle', instance } })
        made.advance(IDLE_MS + 1)
        await retiredOf(made, instance)
        await turns()
      },
      async busyOut(instance) {
        made.handles.get(instance)?.report({ state: occupied(instance) })
        made.advance(IDLE_MS + 1)
        await turns()
      },
      live: () =>
        [...published].filter(instance => !made.retired.some(entry => entry.instance === instance))
          .length,
      denyReserve: () => made.refuseNext('reserve'),
      denyHostPrincipal: () => made.refuseNext('publish', HOST_PRINCIPAL),
      dispose: () => made.dispose(),
    }
  })
  for (const conformance of cases) it(conformance.name, conformance.run)
})

describe('acquire with the plain factory', () => {
  it('publishes a real runtime that the directory resolves for its tenant only', async () => {
    const host = await world('plain')
    const { instance, registration } = ok(await host.provision.acquire(slotOf('a')))
    expect(registration.state).toBe('published')
    const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
    expect(runtime.instance).toBe(instance)
    expect(await host.directory.resolve({ ...caller('b'), instance })).toEqual({
      failure: { kind: 'denied', action: 'resolve' },
    })
  })

  it('checks the caller for reserve and the host principal for publish, once each', async () => {
    const host = await world('plain')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const checks = host.controls.access.check.calls.map(call => [
      call.operation,
      call.access.principal,
    ])
    expect(checks).toEqual([
      ['reserve', 'caller-a'],
      ['publish', HOST_PRINCIPAL],
    ])
    expect(host.controls.access.check.calls[1]?.target).toEqual({ kind: 'instance', instance })
  })

  it('answers invalid for a slot that is not well formed and checks nothing', async () => {
    const host = await world('plain')
    const broken = { ...slotOf('a'), scope: { owner: 'session' } } as never
    expect(await host.provision.acquire(broken)).toMatchObject({
      failure: { kind: 'invalid', field: 'scope' },
    })
    expect(host.controls.access.check.calls).toHaveLength(0)
  })

  it('keeps an idle instance published when the runtime answers quiesce unavailable', async () => {
    const host = await world('plain')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    host.advance(IDLE_MS + 1)
    await turns()
    expect(host.retired).toEqual([])
    expect(host.errors.some(line => line.includes(instance) && line.includes('unavailable'))).toBe(
      true,
    )
    ok(await host.directory.resolve({ ...caller('a'), instance }))
    expect(ok(await host.provision.acquire(slotOf('a'))).instance).toBe(instance)
    // The next idle time tries again: the host waits on the clock once more.
    expect(host.controls.clock.pending()).toHaveLength(1)
  })

  it('keeps the instance published when the host principal is refused quiesce', async () => {
    const host = await world('plain')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    host.refuseNext('quiesce', HOST_PRINCIPAL)
    host.advance(IDLE_MS + 1)
    await turns()
    const quiesce = host.controls.access.check.calls.find(call => call.operation === 'quiesce')
    expect(quiesce?.access.principal).toBe(HOST_PRINCIPAL)
    expect(host.retired).toEqual([])
    expect(host.errors.some(line => line.includes('denied'))).toBe(true)
    ok(await host.directory.resolve({ ...caller('a'), instance }))
  })
})

describe('the reclaim guard point', () => {
  it('gives up the reclaim when an invoke takes the slot in the same turn as the expiry', async () => {
    const host = await world('duties')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
    await turns()
    host.advance(IDLE_MS + 1)
    // The expiry runs on a later microtask; the invoke takes the slot first.
    void runtime.invoke({
      ...caller('a'),
      execution: 'guard-execution' as never,
      operation: operation('guard-invoke'),
      initial: {} as never,
      grant: null,
    })
    await turns()
    expect(host.quiesced).toEqual([])
    expect(host.retired).toEqual([])
    ok(await host.directory.resolve({ ...caller('a'), instance }))
  })

  it('refuses an invoke that arrives after the expiry, and the instance is reclaimed', async () => {
    const host = await world('duties')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
    await turns()
    host.advance(IDLE_MS + 1)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(host.quiesced).toEqual([instance])
    const late = await runtime.invoke({
      ...caller('a'),
      execution: 'late-execution' as never,
      operation: operation('late-invoke'),
      initial: {} as never,
      grant: null,
    })
    expect(late).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await retiredOf(host, instance)).toBe('withdrawn')
    const next = ok(await host.provision.acquire(slotOf('a')))
    expect(next.instance).not.toBe(instance)
  })

  it('keeps the registration published when quiesce leaves work unresolved', async () => {
    const host = await world('duties')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    host.quiesceAnswers.push('unresolved')
    host.advance(IDLE_MS + 1)
    await turns()
    expect(host.quiesced).toEqual([instance])
    expect(host.retired).toEqual([])
    expect(host.errors.some(line => line.includes('unresolved'))).toBe(true)
    expect(ok(await host.provision.acquire(slotOf('a'))).instance).toBe(instance)
    ok(await host.directory.resolve({ ...caller('a'), instance }))
  })

  it('unloads the contribution only after quiesce has withdrawn the registration', async () => {
    const host = await world('duties')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    host.advance(IDLE_MS + 1)
    expect(await retiredOf(host, instance)).toBe('withdrawn')
    expect(host.retired.filter(entry => entry.instance === instance)).toHaveLength(1)
  })
})

describe('reserve, publish and withdraw of the host', () => {
  const reserveInput = (name: string) => ({
    ...caller('a'),
    operation: operation(name),
    scope,
    definition: definitions.first,
  })

  it('reserves without publishing: the directory resolves nothing for the reservation', async () => {
    const host = await world('plain')
    const reserved = ok(await host.instanceHost.reserve(reserveInput('reserve-1')))
    expect(reserved.registration.instance).toBe(reserved.instance)
    expect(await host.directory.resolve({ ...caller('a'), instance: reserved.instance })).toEqual({
      failure: { kind: 'denied', action: 'resolve' },
    })
    expect(host.instanceHost.route(caller('a').tenant, reserved.instance)).toBeNull()
    const again = ok(await host.instanceHost.reserve(reserveInput('reserve-1')))
    expect(again.instance).toBe(reserved.instance)
    expect(
      await host.instanceHost.reserve({
        ...reserveInput('reserve-1'),
        definition: definitions['other-definition'],
      }),
    ).toEqual({ failure: { kind: 'conflict', operation: operation('reserve-1') } })
  })

  it('withdraws an old registration without touching its successor', async () => {
    const host = await world('plain')
    const { instance, registration: first } = ok(await host.provision.acquire(slotOf('a')))
    const successor = ok(
      await host.instanceHost.publish({
        ...caller('a'),
        operation: operation('publish-again'),
        instance,
        scope,
        state: { kind: 'idle', instance },
      }),
    )
    expect(successor.registration).not.toBe(first.registration)
    const late = ok(
      await host.instanceHost.withdraw({
        ...caller('a'),
        operation: operation('withdraw-old'),
        instance,
        registration: first.registration,
      }),
    )
    expect(late).toEqual({ registration: first.registration, state: 'withdrawn' })
    expect(host.retired.map(entry => [entry.generation, entry.reason])).toEqual([[1, 'superseded']])
    const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
    expect(runtime.instance).toBe(instance)
  })

  it('refuses a withdrawal from a fiber that is neither the host nor the instance', async () => {
    const host = await world('plain')
    const { instance, registration } = ok(await host.provision.acquire(slotOf('a')))
    const held: { answer?: Promise<unknown> } = {}
    await host.root.plugin({
      name: 'foreign',
      inject: ['agentInstances'],
      apply(ctx) {
        held.answer = ctx.agentInstances.withdraw({
          ...caller('a'),
          operation: operation('foreign-withdraw'),
          instance,
          registration: registration.registration,
        })
      },
    })
    expect(await held.answer).toEqual({ failure: { kind: 'denied', action: 'withdraw' } })
    expect(host.retired).toEqual([])
    ok(await host.directory.resolve({ ...caller('a'), instance }))
  })

  it('refuses a publish of another scope and recognises a withdrawal by its operation', async () => {
    const host = await world('plain')
    const { instance, registration } = ok(await host.provision.acquire(slotOf('a')))
    const otherScope = { ...scope, record: 'another-slot' }
    expect(
      await host.instanceHost.publish({
        ...caller('a'),
        operation: operation('publish-other-scope'),
        instance,
        scope: otherScope,
        state: { kind: 'idle', instance },
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'publish' } })
    const request = {
      ...caller('a'),
      operation: operation('withdraw-once'),
      instance,
      registration: registration.registration,
    }
    const first = ok(await host.instanceHost.withdraw(request))
    expect(first.state).toBe('withdrawn')
    expect(await host.instanceHost.withdraw(request)).toEqual({ ok: first })
    expect(
      await host.instanceHost.withdraw({
        ...request,
        registration: ok(decodeAgentRegistrationId('another-registration')),
      }),
    ).toEqual({ failure: { kind: 'conflict', operation: request.operation } })
  })

  it('refuses a registration that does not come from the contribution fiber', async () => {
    const host = await world('plain')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const started = {
      ...caller('a'),
      operation: operation('publish-started'),
      instance,
      scope,
      state: { kind: 'idle' as const, instance },
    }
    ok(await host.instanceHost.publish(started))
    const authority = host.root.get('agentPublicationAuthority')
    expect(authority?.check(started, host.root)).toEqual({
      failure: { kind: 'denied', action: 'publish' },
    })
  })

  it('withdraws the current registration through the instance handle', async () => {
    const host = await world('duties')
    const { instance, registration } = ok(await host.provision.acquire(slotOf('a')))
    const handle = host.handles.get(instance)
    const answer = await handle?.withdraw({
      principal: HOST_PRINCIPAL,
      tenant: caller('a').tenant,
      operation: operation('handle-withdraw'),
      reason: scope,
    })
    expect(answer).toEqual({ ok: { registration: registration.registration, state: 'withdrawn' } })
    expect(
      await handle?.withdraw({
        principal: HOST_PRINCIPAL,
        tenant: caller('a').tenant,
        operation: operation('handle-withdraw-2'),
        reason: scope,
      }),
    ).toEqual({ ok: null })
    expect(
      await handle?.withdraw({
        principal: HOST_PRINCIPAL,
        tenant: caller('b').tenant,
        operation: operation('handle-withdraw-3'),
        reason: scope,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'withdraw' } })
  })
})
