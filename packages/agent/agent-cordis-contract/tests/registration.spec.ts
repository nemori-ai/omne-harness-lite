// The instance directory on a real Cordis Context. The directory loads through its own plugin. The
// authority of the host, the access check and the host are test providers of the abstract
// definitions: in a real assembly they come from agent-host-local and the authorization domain.
import { type Context as CordisContext, Context } from '@deepseek-ai/cordis'
import {
  decodeAgentInstanceId,
  decodeAgentOperationId,
  type AgentAccessDecision,
  type AgentHandle,
  type AgentInstanceId,
  type AgentOperationId,
  type AgentRuntime,
  type AgentState,
  type Failure,
  type Registration,
} from '@omne-harness/agent-contract'
import {
  AgentAccessCheckService,
  AgentInstanceHostService,
  AgentInstancesService,
  AgentPublicationAuthorityService,
  agentInstancesPlugin,
  type AgentLocalRoute,
  type AgentRegistrationInput,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'

type Input = AgentRegistrationInput<string>
type Answer = Outcome<Registration, Failure>

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}
function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('failure' in outcome) throw new Error('fixture identity text does not decode')
  return outcome.ok
}

const tenantA = tenant(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)
const tenantB = tenant(
  parsed(organizationCodec.parse(`org_${'2'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'3'.repeat(26)}`)),
)
const instanceOf = (text: string): AgentInstanceId => decoded(decodeAgentInstanceId(text))
const operationOf = (text: string): AgentOperationId => decoded(decodeAgentOperationId(text))
const scope = { owner: 'test', record: 'scope', revision: '1', digest: 'sha256:scope' }

function input(
  options: Partial<
    Readonly<{ tenant: TenantId; instance: string; operation: string; scope: string }>
  > = {},
): Input {
  const instance = instanceOf(options.instance ?? 'instance_1')
  const state: AgentState = { kind: 'idle', instance }
  return {
    principal: 'host',
    tenant: options.tenant ?? tenantA,
    operation: operationOf(options.operation ?? 'operation_1'),
    instance,
    scope: { ...scope, record: options.scope ?? scope.record },
    state,
  }
}

function registrationOf(answer: Answer): Registration {
  if (!('ok' in answer)) throw new Error(`registration failed: ${JSON.stringify(answer)}`)
  return answer.ok
}

const unsupported: Failure = { kind: 'unsupported' }

/** Stands in for the publication authority of the host. It records every question. */
class TestAuthority extends AgentPublicationAuthorityService<string> {
  answer: 'allow' | 'throw' | 'garbage' | Failure = 'allow'
  readonly seen: { input: unknown; caller: CordisContext }[] = []
  readonly check: AgentPublicationAuthorityService<string>['check'] = (input, caller) => {
    this.seen.push({ input, caller })
    if (this.answer === 'throw') throw new Error('the authority broke')
    if (this.answer === 'garbage') return undefined as never
    return this.answer === 'allow' ? { ok: undefined } : { failure: this.answer }
  }
}

/** Stands in for the authorization domain. It records every question. */
class TestAccess extends AgentAccessCheckService<string> {
  decision: AgentAccessDecision | 'throw' = {
    kind: 'allowed',
    evidence: { owner: 'test', record: 'grant', revision: '1', digest: 'sha256:grant' },
  }
  readonly seen: Parameters<AgentAccessCheckService<string>['check']>[0][] = []
  readonly check: AgentAccessCheckService<string>['check'] = async request => {
    this.seen.push(request)
    if (this.decision === 'throw') throw new Error('the access check broke')
    return this.decision
  }
}

/** Stands in for agent-host-local: it owns the objects of live instances and gives their route. */
class TestHost extends AgentInstanceHostService<string> {
  readonly routes = new Map<string, AgentLocalRoute<string> | 'throw'>()
  readonly asked: Readonly<{ tenant: TenantId; instance: AgentInstanceId }>[] = []
  readonly reserve: AgentInstanceHostService<string>['reserve'] = async () => ({
    failure: unsupported,
  })
  readonly publish: AgentInstanceHostService<string>['publish'] = async () => ({
    failure: unsupported,
  })
  readonly withdraw: AgentInstanceHostService<string>['withdraw'] = async () => ({
    failure: unsupported,
  })
  readonly directory: AgentInstanceHostService<string>['directory'] = {
    resolve: async () => ({ failure: unsupported }),
    connect: async () => ({ failure: unsupported }),
  }
  route(tenant: TenantId, instance: AgentInstanceId): AgentLocalRoute<string> | null {
    this.asked.push({ tenant, instance })
    const route = this.routes.get(instance)
    if (route === 'throw') throw new Error('the host broke')
    return route ?? null
  }
}

function routeOf(instance: AgentInstanceId): AgentLocalRoute<string> {
  const runtime: AgentRuntime<string> = {
    instance,
    invoke: async () => ({ failure: unsupported }),
    resume: async () => ({ failure: unsupported }),
  }
  const observation: AgentHandle<string> = { instance, observe: async function* () {} }
  return { runtime, observation }
}

type Retired = Readonly<{
  tenant: TenantId
  instance: AgentInstanceId
  generation: number
  reason: string
}>

async function start() {
  const root = new Context()
  const authority = await provide(root, 'authority', ctx => new TestAuthority(ctx))
  const access = await provide(root, 'access', ctx => new TestAccess(ctx))
  await root.plugin(agentInstancesPlugin)
  const directory = root.get('agentInstances')
  if (directory === undefined) throw new Error('the directory did not load')
  const retired: Retired[] = []
  root.on('agent-cordis-contract/instance-retired', (tenant, instance, generation, reason) => {
    retired.push({ tenant, instance, generation, reason })
  })
  const logs: string[] = []
  root.logger.exporter({ export: message => logs.push(JSON.stringify(message.args)) })
  let count = 0
  return {
    root,
    authority: authority.service,
    access: access.service,
    directory,
    retired,
    logs,
    /** Registers from a fresh contributor fiber. The unload of the fiber ends the registration. */
    async contribute(request: Input) {
      const call: { ctx?: CordisContext; answer?: Promise<Answer> } = {}
      const fiber = root.plugin({
        name: `contributor-${++count}`,
        inject: ['agentInstances'],
        apply(ctx: CordisContext) {
          call.ctx = ctx
          call.answer = ctx.agentInstances.register(request)
        },
      })
      await fiber
      return {
        fiber,
        ctx: call.ctx as CordisContext,
        answer: await (call.answer as Promise<Answer>),
      }
    },
    /** Starts a host as the provider of `agentInstanceHost`, and returns the host and its fiber. */
    async host(...instances: AgentInstanceId[]) {
      const made = await provide(root, `host-${++count}`, ctx => new TestHost(ctx))
      for (const instance of instances) made.service.routes.set(instance, routeOf(instance))
      return made
    },
  }
}

async function provide<S>(root: CordisContext, name: string, make: (ctx: CordisContext) => S) {
  const held: { service?: S } = {}
  const fiber = root.plugin({
    name,
    apply: (ctx: CordisContext) => void (held.service = make(ctx)),
  })
  await fiber
  return { fiber, service: held.service as S }
}

describe('register', () => {
  it('recognises the same operation with the same input from the same fiber', async () => {
    const world = await start()
    const first = input()
    const call: { answers?: Promise<[Answer, Answer]> } = {}
    const fiber = world.root.plugin({
      name: 'repeater',
      inject: ['agentInstances'],
      apply(ctx: CordisContext) {
        call.answers = Promise.all([
          ctx.agentInstances.register(first),
          // An equal input of another object, built in another order: it is the same data.
          ctx.agentInstances.register({ ...input(), scope: { ...scope } }),
        ])
      },
    })
    await fiber
    const [one, two] = await (call.answers as Promise<[Answer, Answer]>)
    expect(registrationOf(two)).toEqual(registrationOf(one))
    expect(registrationOf(one).state).toBe('published')
    await fiber.dispose()
    expect(world.retired).toHaveLength(1)
  })

  it('answers conflict for the same operation with a different input, and keeps the first entry', async () => {
    const world = await start()
    await world.host(instanceOf('instance_1'), instanceOf('instance_2'))
    await world.contribute(input())
    const other = await world.contribute(input({ instance: 'instance_2' }))
    expect(other.answer).toEqual({
      failure: { kind: 'conflict', operation: operationOf('operation_1') },
    })
    const sameInputOtherFiber = await world.contribute(input())
    expect(sameInputOtherFiber.answer).toMatchObject({ failure: { kind: 'conflict' } })
    const access = { principal: 'p', tenant: tenantA }
    expect(
      await world.directory.connect({ ...access, instance: instanceOf('instance_1') }),
    ).toMatchObject({ ok: { kind: 'live' } })
    expect(
      await world.directory.connect({ ...access, instance: instanceOf('instance_2') }),
    ).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('does not take the operation of another tenant for its own', async () => {
    const world = await start()
    const a = await world.contribute(input())
    const b = await world.contribute(input({ tenant: tenantB }))
    expect(registrationOf(b.answer).registration).not.toBe(registrationOf(a.answer).registration)
  })

  it('asks the authority with the context of the calling fiber before it writes anything', async () => {
    const world = await start()
    world.authority.answer = { kind: 'denied', action: 'publish' }
    const refused = await world.contribute(input())
    expect(refused.answer).toEqual({ failure: { kind: 'denied', action: 'publish' } })
    expect(world.authority.seen).toHaveLength(1)
    expect(world.authority.seen[0]?.caller.fiber).toBe(refused.ctx.fiber)
    world.authority.answer = 'allow'
    const entered = await world.contribute(input({ operation: 'operation_2' }))
    // The refused request used no generation and left no entry: the first registration is the first.
    await world.directory.withdraw({
      principal: 'host',
      tenant: tenantA,
      operation: operationOf('operation_3'),
      instance: instanceOf('instance_1'),
      registration: registrationOf(entered.answer).registration,
    })
    expect(world.retired).toMatchObject([{ generation: 1, reason: 'withdrawn' }])
  })

  it.each<readonly [string, TestAuthority['answer'], object]>([
    [
      'unavailable',
      { kind: 'unavailable', owner: 'agentHost', diagnostic: 'reservation unknown' },
      { kind: 'unavailable', owner: 'agentHost' },
    ],
    ['a throw', 'throw', { kind: 'unavailable', owner: 'agentPublicationAuthority' }],
    [
      'an answer of no known shape',
      'garbage',
      { kind: 'unavailable', owner: 'agentPublicationAuthority' },
    ],
  ])('does not write when the authority gives %s', async (_name, answer, failure) => {
    const world = await start()
    world.authority.answer = answer
    const refused = await world.contribute(input())
    expect(refused.answer).toMatchObject({ failure })
    world.authority.answer = 'allow'
    const retry = await world.contribute(input())
    expect(registrationOf(retry.answer).state).toBe('published')
    await retry.fiber.dispose()
    expect(world.retired).toMatchObject([{ generation: 1, reason: 'contributor-removed' }])
  })

  it('answers unavailable when the calling fiber has already ended', async () => {
    const world = await start()
    const ended = await world.contribute(
      input({ operation: 'operation_9', instance: 'instance_9' }),
    )
    await ended.fiber.dispose()
    const late = await ended.ctx.get('agentInstances')?.register(input({ instance: 'instance_3' }))
    expect(late).toMatchObject({ failure: { kind: 'unavailable', owner: 'agentInstances' } })
    const access = { principal: 'p', tenant: tenantA }
    expect(
      await world.directory.connect({ ...access, instance: instanceOf('instance_3') }),
    ).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('makes a registration identity that cannot be guessed from the one before', async () => {
    const world = await start()
    const one = registrationOf((await world.contribute(input({ operation: 'op_a' }))).answer)
    const two = registrationOf((await world.contribute(input({ operation: 'op_b' }))).answer)
    expect(one.registration).toMatch(/^[0-9a-f]{32}$/u)
    expect(two.registration).toMatch(/^[0-9a-f]{32}$/u)
    expect(two.registration).not.toBe(one.registration)
  })
})

describe('a successor registration', () => {
  it('replaces the old one in one step, with the next generation, and tells the old one it was superseded', async () => {
    const world = await start()
    await world.host(instanceOf('instance_1'))
    const old = await world.contribute(input({ operation: 'operation_old' }))
    const successor = await world.contribute(input({ operation: 'operation_new' }))
    expect(registrationOf(successor.answer).state).toBe('published')
    expect(world.retired).toEqual([
      { tenant: tenantA, instance: instanceOf('instance_1'), generation: 1, reason: 'superseded' },
    ])
    // The successor is the entry of the instance: one live route, now under its generation.
    const access = { principal: 'p', tenant: tenantA }
    expect(
      await world.directory.resolve({ ...access, instance: instanceOf('instance_1') }),
    ).toMatchObject({ ok: { instance: instanceOf('instance_1') } })
    // The superseded fiber ends later and reports nothing a second time.
    await old.fiber.dispose()
    expect(world.retired).toHaveLength(1)
    await successor.fiber.dispose()
    expect(world.retired[1]).toMatchObject({ generation: 2, reason: 'contributor-removed' })
  })

  it('is not removed by a late withdrawal that carries the old identity', async () => {
    const world = await start()
    await world.host(instanceOf('instance_1'))
    const old = await world.contribute(input({ operation: 'operation_old' }))
    await world.contribute(input({ operation: 'operation_new' }))
    const late = await world.directory.withdraw({
      principal: 'host',
      tenant: tenantA,
      operation: operationOf('operation_late'),
      instance: instanceOf('instance_1'),
      registration: registrationOf(old.answer).registration,
    })
    expect(late).toEqual({
      ok: { registration: registrationOf(old.answer).registration, state: 'withdrawn' },
    })
    const access = { principal: 'p', tenant: tenantA }
    expect(
      await world.directory.connect({ ...access, instance: instanceOf('instance_1') }),
    ).toMatchObject({ ok: { kind: 'live' } })
    expect(world.retired).toHaveLength(1)
  })

  it('numbers generations from 1 per instance and does not reuse a released number', async () => {
    const world = await start()
    const first = await world.contribute(input({ operation: 'operation_1' }))
    await first.fiber.dispose()
    const second = await world.contribute(input({ operation: 'operation_2' }))
    await second.fiber.dispose()
    const other = await world.contribute(
      input({ operation: 'operation_3', instance: 'instance_2' }),
    )
    await other.fiber.dispose()
    expect(world.retired.map(event => [event.instance, event.generation])).toEqual([
      [instanceOf('instance_1'), 1],
      [instanceOf('instance_1'), 2],
      [instanceOf('instance_2'), 1],
    ])
  })
})

describe('when the calling fiber unloads', () => {
  it('removes the registration, reports contributor-removed once, and answers a late withdrawal as withdrawn', async () => {
    const world = await start()
    await world.host(instanceOf('instance_1'))
    const contribution = await world.contribute(input())
    const { registration } = registrationOf(contribution.answer)
    await contribution.fiber.dispose()
    expect(world.retired).toEqual([
      {
        tenant: tenantA,
        instance: instanceOf('instance_1'),
        generation: 1,
        reason: 'contributor-removed',
      },
    ])
    const access = { principal: 'p', tenant: tenantA }
    expect(
      await world.directory.resolve({ ...access, instance: instanceOf('instance_1') }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    const late = await world.directory.withdraw({
      principal: 'host',
      tenant: tenantA,
      operation: operationOf('operation_late'),
      instance: instanceOf('instance_1'),
      registration,
    })
    expect(late).toEqual({ ok: { registration, state: 'withdrawn' } })
    expect(world.retired).toHaveLength(1)
  })
})

describe('withdraw', () => {
  const withdrawal = (registration: Registration['registration'], overrides: object = {}) => ({
    principal: 'host',
    tenant: tenantA,
    operation: operationOf('operation_w'),
    instance: instanceOf('instance_1'),
    registration,
    ...overrides,
  })

  it('removes the entry, answers withdrawn, reports withdrawn once, and recognises a repeat', async () => {
    const world = await start()
    await world.host(instanceOf('instance_1'))
    const contribution = await world.contribute(input())
    const { registration } = registrationOf(contribution.answer)
    const ended = await world.directory.withdraw(withdrawal(registration))
    expect(ended).toEqual({ ok: { registration, state: 'withdrawn' } })
    expect(world.retired).toEqual([
      { tenant: tenantA, instance: instanceOf('instance_1'), generation: 1, reason: 'withdrawn' },
    ])
    const repeat = await world.directory.withdraw(withdrawal(registration))
    expect(repeat).toEqual(ended)
    // The entry is gone, and so the unload of the fiber has nothing left to remove or to report.
    await contribution.fiber.dispose()
    expect(world.retired).toHaveLength(1)
    const access = { principal: 'p', tenant: tenantA }
    expect(
      await world.directory.connect({ ...access, instance: instanceOf('instance_1') }),
    ).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('asks the authority with the context of the caller and keeps the entry when it refuses', async () => {
    const world = await start()
    await world.host(instanceOf('instance_1'))
    const { answer } = await world.contribute(input())
    const { registration } = registrationOf(answer)
    world.authority.answer = { kind: 'denied', action: 'withdraw' }
    const refused = await world.directory.withdraw(withdrawal(registration))
    expect(refused).toEqual({ failure: { kind: 'denied', action: 'withdraw' } })
    expect(world.authority.seen.at(-1)?.input).toMatchObject({ registration })
    expect(world.retired).toEqual([])
    world.authority.answer = 'allow'
    const access = { principal: 'p', tenant: tenantA }
    expect(
      await world.directory.connect({ ...access, instance: instanceOf('instance_1') }),
    ).toMatchObject({ ok: { kind: 'live' } })
  })

  it.each([
    ['another tenant', { tenant: tenantB }],
    ['another instance', { instance: instanceOf('instance_2') }],
  ])(
    'answers denied for an identity that belongs to %s, and removes nothing',
    async (_name, overrides) => {
      const world = await start()
      const { answer } = await world.contribute(input())
      const { registration } = registrationOf(answer)
      const refused = await world.directory.withdraw(withdrawal(registration, overrides))
      expect(refused).toEqual({ failure: { kind: 'denied', action: 'withdraw' } })
      const guessed = await world.directory.withdraw(
        withdrawal('0123456789abcdef0123456789abcdef' as Registration['registration']),
      )
      expect(guessed).toEqual({ failure: { kind: 'denied', action: 'withdraw' } })
      expect(world.retired).toEqual([])
    },
  )
})

describe('a listener of instance-retired that fails', () => {
  it.each([
    [
      'throws',
      () => {
        throw new Error('secret-boom')
      },
    ],
    [
      'rejects',
      async () => {
        throw new Error('secret-boom')
      },
    ],
  ])(
    'does not change what register, withdraw and the unload answer when it %s',
    async (_name, listener) => {
      const world = await start()
      world.root.on('agent-cordis-contract/instance-retired', listener)
      const old = await world.contribute(input({ operation: 'operation_old' }))
      const successor = await world.contribute(input({ operation: 'operation_new' }))
      expect(registrationOf(successor.answer).state).toBe('published')
      const ended = await world.directory.withdraw({
        principal: 'host',
        tenant: tenantA,
        operation: operationOf('operation_w'),
        instance: instanceOf('instance_1'),
        registration: registrationOf(successor.answer).registration,
      })
      expect(ended).toEqual({
        ok: { registration: registrationOf(successor.answer).registration, state: 'withdrawn' },
      })
      await old.fiber.dispose()
      await successor.fiber.dispose()
      // The listener of the world still saw each removal that happened, once.
      expect(world.retired.map(event => event.reason)).toEqual(['superseded', 'withdrawn'])
      // The failures were recorded, and the record names no payload of the failure.
      expect(world.logs.filter(line => line.includes('instance-retired'))).toHaveLength(2)
      expect(world.logs.join('')).not.toContain('secret-boom')
    },
  )

  it('is told of every failure together: all listeners run and the record counts them', async () => {
    const world = await start()
    world.root.on('agent-cordis-contract/instance-retired', () => {
      throw new Error('first')
    })
    world.root.on('agent-cordis-contract/instance-retired', async () => {
      throw new Error('second')
    })
    const contribution = await world.contribute(input())
    await world.directory.withdraw({
      principal: 'host',
      tenant: tenantA,
      operation: operationOf('operation_w'),
      instance: instanceOf('instance_1'),
      registration: registrationOf(contribution.answer).registration,
    })
    expect(world.retired).toHaveLength(1)
    expect(world.logs.filter(line => line.includes('2 listener(s)'))).toHaveLength(1)
  })

  it('does not hold the unload of the fiber that it follows', async () => {
    const world = await start()
    let release: () => void = () => undefined
    world.root.on(
      'agent-cordis-contract/instance-retired',
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )
    const contribution = await world.contribute(input())
    await contribution.fiber.dispose()
    expect(world.retired).toHaveLength(1)
    release()
  })
})

describe('resolve and connect', () => {
  const asker = (overrides: object = {}) => ({
    principal: 'caller',
    tenant: tenantA,
    instance: instanceOf('instance_1'),
    ...overrides,
  })

  it('give the runtime and the observation that the host gives for a published instance', async () => {
    const world = await start()
    const host = await world.host(instanceOf('instance_1'))
    await world.contribute(input())
    const route = host.service.routes.get(instanceOf('instance_1')) as AgentLocalRoute<string>
    expect(await world.directory.resolve(asker())).toEqual({ ok: route.runtime })
    expect(await world.directory.connect(asker())).toEqual({
      ok: { kind: 'live', handle: route.observation },
    })
    expect(host.service.asked.at(-1)).toEqual({
      tenant: tenantA,
      instance: instanceOf('instance_1'),
    })
  })

  it('check the access first, with the operation and the instance, and the host is not asked on a refusal', async () => {
    const world = await start()
    const host = await world.host(instanceOf('instance_1'))
    await world.contribute(input())
    await world.directory.resolve(asker())
    await world.directory.connect(asker())
    expect(world.access.seen).toEqual([
      {
        access: { principal: 'caller', tenant: tenantA },
        operation: 'resolve',
        target: { kind: 'instance', instance: instanceOf('instance_1') },
      },
      {
        access: { principal: 'caller', tenant: tenantA },
        operation: 'connect',
        target: { kind: 'instance', instance: instanceOf('instance_1') },
      },
    ])
    const asked = host.service.asked.length
    world.access.decision = { kind: 'denied' }
    expect(await world.directory.resolve(asker())).toEqual({
      failure: { kind: 'denied', action: 'resolve' },
    })
    expect(await world.directory.connect(asker())).toEqual({
      failure: { kind: 'denied', action: 'connect' },
    })
    expect(host.service.asked).toHaveLength(asked)
  })

  it.each<readonly [string, TestAccess['decision']]>([
    ['unavailable', { kind: 'unavailable', diagnostic: 'the grant store is down' }],
    ['a throw', 'throw'],
  ])('do not admit a caller when the access check gives %s', async (_name, decision) => {
    const world = await start()
    const host = await world.host(instanceOf('instance_1'))
    await world.contribute(input())
    world.access.decision = decision
    for (const answer of [
      await world.directory.resolve(asker()),
      await world.directory.connect(asker()),
    ]) {
      expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'agentAccessCheck' } })
    }
    expect(host.service.asked).toEqual([])
  })

  it('do not admit a caller when no access check is provided', async () => {
    const root = new Context()
    const authority = await provide(root, 'authority', ctx => new TestAuthority(ctx))
    const loaded = await provide(
      root,
      'directory',
      ctx => new AgentInstancesService(ctx, authority.service),
    )
    const host = await provide(root, 'host', ctx => new TestHost(ctx))
    host.service.routes.set(instanceOf('instance_1'), routeOf(instanceOf('instance_1')))
    const answer = await loaded.service.resolve(asker())
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'agentAccessCheck' } })
    expect(host.service.asked).toEqual([])
  })

  it('answer denied for an instance of another tenant, as for one that does not exist', async () => {
    const world = await start()
    const host = await world.host(instanceOf('instance_1'))
    await world.contribute(input())
    const other = asker({ tenant: tenantB })
    expect(await world.directory.resolve(other)).toEqual({
      failure: { kind: 'denied', action: 'resolve' },
    })
    expect(await world.directory.connect(other)).toEqual({
      failure: { kind: 'denied', action: 'connect' },
    })
    expect(
      await world.directory.resolve(asker({ instance: instanceOf('instance_9') })),
    ).toMatchObject({
      failure: { kind: 'denied' },
    })
    // The access check allowed every call above, so the refusal is the key of the directory.
    expect(world.access.seen).toHaveLength(3)
    expect(host.service.asked).toEqual([])
  })

  it('take the host from the context at each call: absent, then present, replaced, absent again', async () => {
    const world = await start()
    await world.contribute(input())
    expect(await world.directory.resolve(asker())).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agentInstanceHost' },
    })
    expect(await world.directory.connect(asker())).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agentInstanceHost' },
    })
    const first = await world.host(instanceOf('instance_1'))
    const firstRoute = first.service.routes.get(instanceOf('instance_1')) as AgentLocalRoute<string>
    expect(await world.directory.resolve(asker())).toEqual({ ok: firstRoute.runtime })
    await first.fiber.dispose()
    expect(await world.directory.resolve(asker())).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    const second = await world.host(instanceOf('instance_1'))
    const secondRoute = second.service.routes.get(
      instanceOf('instance_1'),
    ) as AgentLocalRoute<string>
    expect(secondRoute.runtime).not.toBe(firstRoute.runtime)
    expect(await world.directory.resolve(asker())).toEqual({ ok: secondRoute.runtime })
    expect(first.service.asked).toHaveLength(1)
  })

  it('answer no-live-route for connect, and unavailable for resolve, when the host has no route', async () => {
    const world = await start()
    const host = await world.host()
    await world.contribute(input())
    expect(await world.directory.connect(asker())).toEqual({ ok: { kind: 'no-live-route' } })
    expect(await world.directory.resolve(asker())).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agentInstances' },
    })
    expect(host.service.asked).toHaveLength(2)
  })

  it('answer unavailable when the host throws, and never throw', async () => {
    const world = await start()
    const host = await world.host()
    host.service.routes.set(instanceOf('instance_1'), 'throw')
    await world.contribute(input())
    expect(await world.directory.resolve(asker())).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agentInstanceHost' },
    })
  })

  it('give no route for a registration that has ended', async () => {
    const world = await start()
    const host = await world.host(instanceOf('instance_1'))
    const contribution = await world.contribute(input())
    await contribution.fiber.dispose()
    expect(await world.directory.resolve(asker())).toMatchObject({ failure: { kind: 'denied' } })
    expect(await world.directory.connect(asker())).toMatchObject({ failure: { kind: 'denied' } })
    expect(host.service.asked).toEqual([])
  })
})
