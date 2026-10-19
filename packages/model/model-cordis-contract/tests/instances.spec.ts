import type { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import { callId, instanceId, tenantA, tenantB, tenantOf } from './identities.ts'
import {
  evidence,
  execution,
  handleOf,
  input,
  registrationOf,
  startDirectory,
  surrogateAuthority,
  type Input,
  type Registered,
} from './instances-harness.ts'
import {
  ModelInstancesService,
  modelInstancesKey,
  type ModelRegistrationFailure,
} from '../src/cordis.ts'

describe('definition', () => {
  it('is written once, served as ctx.modelInstances, and gone with the fiber that hosts it', async () => {
    expect(ModelInstancesService.provide).toBe('modelInstances')
    expect(modelInstancesKey).toBe(ModelInstancesService.provide)
    const world = await startDirectory()

    expect(world.root.get(modelInstancesKey)).toBeInstanceOf(ModelInstancesService)
    await world.host.dispose()

    expect(world.root.get(modelInstancesKey)).toBeUndefined()
  })

  it('keeps its state out of the instance: only connect and register are reachable by other plugins, and there is no get', async () => {
    const world = await startDirectory()
    const handle = handleOf(instanceId('one'))
    registrationOf(
      (await world.contribute(input(execution(tenantA, callId('one'), handle.instance), handle)))
        .outcome,
    )

    // Cordis 4.0.4 places its tracker symbol on every Service instance; any other key is directory state.
    expect(Reflect.ownKeys(world.directory).map(String).sort()).toEqual([
      'Symbol(cordis.tracker)',
      'connect',
      'ctx',
      'name',
      'register',
    ])
    expect(Reflect.has(world.directory, 'get')).toBe(false)
  })
})

describe('connect', () => {
  it('answers no-live-route for a call that nobody registered', async () => {
    const world = await startDirectory()

    expect(await world.routeOfCall(tenantA, callId('nobody'))).toEqual({ kind: 'no-live-route' })
  })

  it('refuses a tenant that is not a parsed identity instead of answering for it', async () => {
    const world = await startDirectory()
    const forged = { ...tenantA }

    const refused = await world.connect({
      principal: 'principal',
      tenant: forged,
      call: callId('one'),
    })

    expect(refused).toEqual({
      failure: { kind: 'invalid', field: 'tenant', reason: expect.stringMatching(/\S/) },
    })
  })

  it('answers the handle that the host registered, as the same object', async () => {
    const world = await startDirectory()
    const handle = handleOf(instanceId('one'))
    const call = callId('one')
    registrationOf(
      (await world.contribute(input(execution(tenantA, call, handle.instance), handle))).outcome,
    )

    const route = await world.routeOfCall(tenantA, call)

    expect(route.kind === 'live' && route.handle).toBe(handle)
  })
})

describe('registration lifetime', () => {
  it('withdraws the registration when the fiber that registered it is disposed', async () => {
    const world = await startDirectory()
    const handle = handleOf(instanceId('one'))
    const call = callId('one')
    const { fiber, outcome } = await world.contribute(
      input(execution(tenantA, call, handle.instance), handle),
    )
    registrationOf(outcome)
    expect((await world.routeOfCall(tenantA, call)).kind).toBe('live')

    await fiber.dispose()

    expect(await world.routeOfCall(tenantA, call)).toEqual({ kind: 'no-live-route' })
  })

  it('registers nothing from a fiber that has exited: reading the injected service throws at once, a kept reference rejects', async () => {
    const world = await startDirectory()
    const handle = handleOf(instanceId('late'))
    const call = callId('late')
    const request = input(execution(tenantA, call, handle.instance), handle)
    const kept: { ctx?: Context; service?: Context['modelInstances'] } = {}
    const fiber = world.root.plugin({
      inject: ['modelInstances'],
      apply(ctx: Context) {
        kept.ctx = ctx
        kept.service = ctx.modelInstances
      },
    })
    await fiber
    await fiber.dispose()

    expect(() => kept.ctx?.modelInstances.register(request)).toThrow('inactive context')
    const viaKeptReference: Promise<Registered> | undefined = kept.service?.register(request)
    await expect(viaKeptReference).rejects.toThrow('inactive context')
    expect(await world.routeOfCall(tenantA, call)).toEqual({ kind: 'no-live-route' })
  })
})

describe('qualification', () => {
  it('asks the qualification authority inside the registering call, before the call yields', async () => {
    const authority = surrogateAuthority()
    const world = await startDirectory(authority)
    const handle = handleOf(instanceId('one'))
    const request = input(execution(tenantA, callId('one'), handle.instance), handle)
    let askedBeforeYield = 0
    let pending: Promise<Registered> | undefined
    await world.root.plugin({
      inject: ['modelInstances'],
      apply(ctx: Context) {
        pending = ctx.modelInstances.register(request)
        askedBeforeYield = authority.seen.length
      },
    })

    expect(askedBeforeYield).toBe(1)
    expect(authority.seen[0]).toBe(request)
    registrationOf(await (pending ?? Promise.reject(new Error('not registered'))))
  })

  const refusals: readonly ModelRegistrationFailure[] = [
    { kind: 'denied' },
    { kind: 'stale-publication' },
    { kind: 'unavailable', diagnostic: 'the authority cannot give a current answer' },
  ]
  it.each(refusals)(
    'returns the refusal of the authority unchanged and registers nothing: $kind',
    async refusal => {
      const authority = surrogateAuthority()
      authority.deny(refusal)
      const world = await startDirectory(authority)
      const handle = handleOf(instanceId('one'))
      const call = callId('one')

      const refused = await world.contribute(
        input(execution(tenantA, call, handle.instance), handle),
      )

      expect(refused.outcome).toEqual({ failure: refusal })
      expect(await world.routeOfCall(tenantA, call)).toEqual({ kind: 'no-live-route' })
    },
  )

  it('leaves the fiber of a refused registration with the effects it had before, so refusals collect nothing', async () => {
    const authority = surrogateAuthority()
    authority.deny({ kind: 'denied' })
    const world = await startDirectory(authority)
    const idle = world.root.plugin({ inject: ['modelInstances'], apply() {} })
    await idle
    const handle = handleOf(instanceId('one'))

    const refused = await world.contribute(
      input(execution(tenantA, callId('one'), handle.instance), handle),
    )

    expect(refused.fiber.getEffects().length).toBe(idle.getEffects().length)
  })

  it('rejects the call and registers nothing when the authority itself fails', async () => {
    const world = await startDirectory({
      check() {
        throw new Error('authority down')
      },
    })
    const handle = handleOf(instanceId('one'))
    const call = callId('one')

    await expect(
      world.contribute(input(execution(tenantA, call, handle.instance), handle)),
    ).rejects.toThrow('authority down')

    expect(await world.routeOfCall(tenantA, call)).toEqual({ kind: 'no-live-route' })
  })
})

describe('registration protocol', () => {
  const call = callId('one')
  const handle = handleOf(instanceId('one'))
  const request = () => input(execution(tenantA, call, handle.instance), handle)
  const servedHandle = async (tenant = tenantA) => {
    const route = await world().routeOfCall(tenant, call)
    return route.kind === 'live' ? route.handle : undefined
  }
  let current: Awaited<ReturnType<typeof startDirectory>> | undefined
  const world = () => {
    if (current === undefined) throw new Error('no directory')
    return current
  }
  beforeEach(async () => {
    current = await startDirectory()
  })

  it('recognises the same registration of the same fiber and gives back the same registration', async () => {
    const same = request()
    let first: Promise<Registered> | undefined
    let second: Promise<Registered> | undefined
    await world().root.plugin({
      inject: ['modelInstances'],
      apply(ctx: Context) {
        first = ctx.modelInstances.register(same)
        second = ctx.modelInstances.register(same)
      },
    })

    const once = registrationOf(await (first ?? Promise.reject(new Error('not registered'))))
    const again = registrationOf(await (second ?? Promise.reject(new Error('not registered'))))
    expect(again).toBe(once)
    expect(again.receipt).toBe(once.receipt)
    expect(again.release).toBe(once.release)
  })

  it('puts the registered execution and a token of its own in the receipt, and the token does not spell out the call', async () => {
    const other = handleOf(instanceId('two'))
    const first = registrationOf((await world().contribute(request())).outcome)
    const second = registrationOf(
      (
        await world().contribute(
          input(execution(tenantA, callId('two'), other.instance, '7'), other),
        )
      ).outcome,
    )

    expect(first.receipt.execution).toEqual(execution(tenantA, call, handle.instance))
    expect(second.receipt.execution).toEqual(execution(tenantA, callId('two'), other.instance, '7'))
    expect(first.receipt.registration).not.toBe(second.receipt.registration)
    expect(first.receipt.registration).not.toContain(call)
    expect(first.receipt.registration).not.toContain(handle.instance)
  })

  it('recognises a registration by what it said when it was made, even when the caller changed the objects it passed in', async () => {
    const world = await startDirectory()
    const said = execution(tenantA, call, handle.instance)
    const grant = evidence()
    const kept = { ...said }
    const keptGrant = { ...grant }
    let first: Promise<Registered> | undefined
    let again: Promise<Registered> | undefined
    await world.root.plugin({
      inject: ['modelInstances'],
      apply(ctx: Context) {
        first = ctx.modelInstances.register(input(kept, handle, keptGrant))
        kept.generation = '9'
        keptGrant.digest = 'changed'
        again = ctx.modelInstances.register(input(said, handle, grant))
      },
    })

    const once = registrationOf(await (first ?? Promise.reject(new Error('not registered'))))
    expect(registrationOf(await (again ?? Promise.reject(new Error('not registered'))))).toBe(once)
    expect(once.receipt.execution.generation).toBe('1')
  })

  describe('a second registration of the same fiber', () => {
    // Everything but one thing is the same as in the first registration: the fiber, the call and
    // the evidence. Only a registration that is the same in every respect is recognised.
    const variations: readonly (readonly [string, () => Input])[] = [
      [
        'another handle for the same instance',
        () => input(execution(tenantA, call, handle.instance), handleOf(handle.instance)),
      ],
      ['another generation', () => input(execution(tenantA, call, handle.instance, '2'), handle)],
      [
        'another instance for the same handle object',
        () => input(execution(tenantA, call, instanceId('two')), handle),
      ],
      [
        'another instance with a handle of its own',
        () => {
          const another = handleOf(instanceId('two'))
          return input(execution(tenantA, call, another.instance), another)
        },
      ],
      ...(['owner', 'record', 'revision', 'digest'] as const).map(
        (field): readonly [string, () => Input] => [
          `qualification evidence that differs only in its ${field}`,
          () =>
            input(execution(tenantA, call, handle.instance), handle, {
              ...evidence(),
              [field]: `another-${field}`,
            }),
        ],
      ),
    ]

    it.each(variations)('refuses %s, and keeps serving the first', async (_what, second) => {
      let first: Promise<Registered> | undefined
      let rival: Promise<Registered> | undefined
      await world().root.plugin({
        inject: ['modelInstances'],
        apply(ctx: Context) {
          first = ctx.modelInstances.register(request())
          rival = ctx.modelInstances.register(second())
        },
      })

      registrationOf(await (first ?? Promise.reject(new Error('not registered'))))
      expect(await (rival ?? Promise.reject(new Error('not registered')))).toEqual({
        failure: { kind: 'conflict' },
      })
      expect(await servedHandle()).toBe(handle)
    })
  })

  it('refuses the same registration from another fiber: a registration is not shared between fibers', async () => {
    registrationOf((await world().contribute(request())).outcome)

    const other = await world().contribute(request())

    expect(other.outcome).toEqual({ failure: { kind: 'conflict' } })
    expect(await servedHandle()).toBe(handle)
  })

  it('refuses a newer generation or another instance of a call that is held', async () => {
    registrationOf((await world().contribute(request())).outcome)

    const newer = await world().contribute(
      input(execution(tenantA, call, handle.instance, '2'), handle),
    )
    const another = handleOf(instanceId('two'))
    const replaced = await world().contribute(
      input(execution(tenantA, call, another.instance), another),
    )

    expect(newer.outcome).toEqual({ failure: { kind: 'conflict' } })
    expect(replaced.outcome).toEqual({ failure: { kind: 'conflict' } })
    expect(await servedHandle()).toBe(handle)
  })

  it('lets a successor take the call once the registration before it is withdrawn', async () => {
    const first = await world().contribute(request())
    const successor = handleOf(instanceId('two'))
    await registrationOf(first.outcome).release()

    const next = await world().contribute(
      input(execution(tenantA, call, successor.instance, '2'), successor),
    )

    registrationOf(next.outcome)
    expect(await servedHandle()).toBe(successor)
  })

  it('lets a successor take the call once the fiber of the registration before it is disposed', async () => {
    const first = await world().contribute(request())
    const successor = handleOf(instanceId('two'))
    await first.fiber.dispose()

    registrationOf(
      (
        await world().contribute(
          input(execution(tenantA, call, successor.instance, '2'), successor),
        )
      ).outcome,
    )

    expect(await servedHandle()).toBe(successor)
  })

  it('keeps the same call of two tenants apart', async () => {
    const other = handleOf(instanceId('two'))
    registrationOf((await world().contribute(request())).outcome)
    registrationOf(
      (await world().contribute(input(execution(tenantB, call, other.instance), other))).outcome,
    )

    expect(await servedHandle(tenantA)).toBe(handle)
    expect(await servedHandle(tenantB)).toBe(other)
  })

  it('refuses a publication of a tenant that is not a parsed identity, and registers nothing', async () => {
    const forged = {
      ...tenantOf('org_abcdefghjkmnpqrstvwxyz2345', 'acc_abcdefghjkmnpqrstvwxyz2345'),
    }

    const refused = await world().contribute(
      input(execution(forged, call, handle.instance), handle),
    )

    expect(refused.outcome).toEqual({
      failure: { kind: 'invalid', reason: expect.stringContaining('tenant') },
    })
    expect(await servedHandle()).toBeUndefined()
  })
})

describe('release', () => {
  const call = callId('one')
  const handle = handleOf(instanceId('one'))
  const request = () => input(execution(tenantA, call, handle.instance), handle)

  it('removes its own entry and reports it once: a repeated release reports that nothing was removed', async () => {
    const world = await startDirectory()
    const { outcome } = await world.contribute(request())
    const registration = registrationOf(outcome)

    expect(await registration.release()).toStrictEqual({ removed: true })
    expect(await world.routeOfCall(tenantA, call)).toEqual({ kind: 'no-live-route' })
    expect(await registration.release()).toStrictEqual({ removed: false })
  })

  it('removes the entry once when two releases run at the same time', async () => {
    const world = await startDirectory()
    const registration = registrationOf((await world.contribute(request())).outcome)

    const results = await Promise.all([registration.release(), registration.release()])

    expect(results).toStrictEqual([{ removed: true }, { removed: false }])
  })

  it('reports that nothing was removed when the disposal of the registering fiber took the entry first', async () => {
    const world = await startDirectory()
    const { fiber, outcome } = await world.contribute(request())
    await fiber.dispose()

    expect(await registrationOf(outcome).release()).toStrictEqual({ removed: false })
    expect(await world.routeOfCall(tenantA, call)).toEqual({ kind: 'no-live-route' })
  })

  it('does not let a late release or a late fiber disposal of the old registration remove the successor', async () => {
    const world = await startDirectory()
    const successor = handleOf(instanceId('two'))
    const first = await world.contribute(request())
    const old = registrationOf(first.outcome)
    await old.release()
    registrationOf(
      (await world.contribute(input(execution(tenantA, call, successor.instance, '2'), successor)))
        .outcome,
    )

    expect(await old.release()).toStrictEqual({ removed: false })
    await first.fiber.dispose()

    const route = await world.routeOfCall(tenantA, call)
    expect(route.kind === 'live' && route.handle).toBe(successor)
  })

  it('takes the effect of the registration off the fiber, so a fiber that registers and releases again and again collects nothing', async () => {
    const world = await startDirectory()
    const { fiber, outcome } = await world.contribute(request())
    const registered = fiber.getEffects().length

    await registrationOf(outcome).release()

    expect(registered - fiber.getEffects().length).toBe(1)
  })

  it('never calls the handle: withdrawing a registration does not cancel the call behind it', async () => {
    const world = await startDirectory()
    const calls: string[] = []
    const watched = {
      instance: handle.instance,
      observe() {
        calls.push('observe')
        return handle.observe({
          principal: 'principal',
          tenant: tenantA,
          signal: new AbortController().signal,
        })
      },
    }
    const { fiber, outcome } = await world.contribute(
      input(execution(tenantA, call, handle.instance), watched),
    )
    await world.routeOfCall(tenantA, call)
    await registrationOf(outcome).release()
    await fiber.dispose()

    expect(calls).toEqual([])
  })
})
