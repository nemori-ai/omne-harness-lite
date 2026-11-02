// The ports that the plugin reads per call (SPEC「端口接线」; verification 2 and 3). A port that is
// absent or that throws makes only the operation that needs it answer `unavailable`, with the
// service key of the port as owner; reads and unrelated operations go on, and a provider that
// arrives later is used by the next call without the plugin body running again.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SessionClockService,
  SessionContextInputService,
  SessionEvidenceBridgeService,
  SessionIdentityBridgeService,
  SessionIdleInputService,
  SessionTransactionPortService,
} from '@omne-harness/session-cordis-contract/cordis'
import { creation, operationId } from '@omne-harness/session-contract/testing'
import { createPorts } from '../src/ports.ts'
import { assemble, serviceOf, type Assembly, type PortName } from './fixtures/assembly.ts'

const open: Assembly[] = []
afterEach(async () => {
  for (const assembly of open.splice(0)) await assembly.close()
})

async function build(omit: readonly PortName[] = []): Promise<Assembly> {
  const assembly = await assemble({ omit })
  open.push(assembly)
  return assembly
}

/** `ctx.plugin` for plugins of any shape; the typed overloads reject the test doubles. */
const loose = (ctx: Context) =>
  ctx.plugin as unknown as (plugin: unknown) => Promise<{ dispose(): Promise<void> }>

const throwing = (method: string) => ({
  [method]: () => Promise.reject(new Error('port crashed')),
})

/** `create` through the real service, as the answer and not as a receipt. */
async function tryCreate(a: Assembly, session = 'session-1') {
  const intake = await a.caller('intake')
  return intake.session().management.create({
    ...a.access(session),
    operation: operationId(`create-${session}`),
    creation: creation(),
  })
}

describe('a port that is absent', () => {
  it.each([['sessionIdentity'], ['sessionEvidence'], ['sessionContextInput']] as const)(
    '%s: create answers unavailable with the key as owner, and the plugin stays loaded',
    async key => {
      const a = await build([key])
      expect(await tryCreate(a)).toMatchObject({
        failure: { kind: 'unavailable', owner: key },
      })
      expect(a.ctx.get('session')).toBeDefined()
    },
  )

  it.each([
    ['sessionClock', 'sessionClock'],
    ['sessionIdleInput', 'sessionIdleInput'],
  ] as const)('%s: inspectIdle answers unavailable with the key as owner', async (key, owner) => {
    const a = await build([key])
    const intake = await a.caller('intake')
    await a.create(intake)
    const maintainer = await a.caller('maintainer')
    const answer = await maintainer.session().management.inspectIdle({
      ...a.access(),
      principal: 'system:maintainer',
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner } })
  })

  it('sessionTransactions: only pending, references and releasedScopes answer unavailable', async () => {
    const a = await build(['sessionTransactions'])
    const intake = await a.caller('intake')
    const maintainer = await a.caller('maintainer')
    const reconcile = maintainer.session().reconciliation
    const system = { principal: 'system:maintainer', tenant: a.tenant }
    expect(await reconcile.pending({ ...system, after: null, limit: 10 })).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionTransactions' },
    })
    expect(await reconcile.references({ ...system } as never)).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionTransactions' },
    })
    expect(await reconcile.releasedScopes({ ...system } as never)).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionTransactions' },
    })
    // A command and a single-session read go through the delegated entry and are not affected.
    await a.create(intake)
    expect(
      await intake.session().work.queryOperation({
        ...a.access(),
        operation: operationId('create-session-1'),
      }),
    ).toHaveProperty('ok')
  })

  it('arrives later: the next call uses it, and the plugin body does not run again', async () => {
    const a = await build(['sessionEvidence'])
    const registered = a.handles.get('session-provider')
    expect(await tryCreate(a)).toMatchObject({ failure: { owner: 'sessionEvidence' } })
    await a.provide('sessionEvidence')
    const intake = await a.caller('intake')
    expect((await a.create(intake)).revision).toBeDefined()
    expect(Object.is(a.handles.get('session-provider'), registered)).toBe(true)
  })

  it('the Agent port: the Run opens and no call goes out; once it arrives, the next session invokes', async () => {
    const a = await build(['sessionAgentDrive'])
    const intake = await a.caller('intake')
    const registered = a.handles.get('session-provider')
    await a.create(intake, 'session-1')
    a.bindings.controls.bind(a.tenant, a.sessionId('session-1'))
    await a.accept(intake, 'first', 'session-1')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(a.hooks.invoked).toHaveLength(0)

    await a.provide('sessionAgentDrive')
    await a.create(intake, 'session-2')
    a.bindings.controls.bind(a.tenant, a.sessionId('session-2'))
    await a.accept(intake, 'second', 'session-2')
    await expect.poll(() => a.hooks.invoked.length, { timeout: 5000 }).toBe(1)
    expect(Object.is(a.handles.get('session-provider'), registered)).toBe(true)
  })
})

describe('a port that throws', () => {
  it.each([
    ['sessionIdentity', SessionIdentityBridgeService, 'prepare'],
    ['sessionEvidence', SessionEvidenceBridgeService, 'prepare'],
    ['sessionContextInput', SessionContextInputService, 'prepare'],
  ] as const)(
    '%s: the call answers unavailable with the cause in the diagnostic, never success',
    async (key, Base, method) => {
      const a = await build([key])
      await a.provide(key, serviceOf(Base, throwing(method), 'Crashing'))
      const answer = await tryCreate(a)
      expect(answer).toMatchObject({
        failure: {
          kind: 'unavailable',
          owner: key,
          diagnostic: expect.stringContaining('port crashed'),
        },
      })
      // The fault is recorded where a person can find it.
      expect(
        a.ctx.logger.buffer.some(message => String(message.args[0]).includes('port crashed')),
      ).toBe(true)
      // A later provider that works restores the operation; the failed call left nothing behind.
      await a.withdraw(key)
      await a.provide(key)
      const intake = await a.caller('intake')
      expect((await a.create(intake)).revision).toBeDefined()
    },
  )

  it('sessionClock: sample answers unavailable', async () => {
    const a = await build(['sessionClock'])
    await a.provide('sessionClock', serviceOf(SessionClockService, throwing('sample'), 'Crashing'))
    await a.create(await a.caller('intake'))
    const maintainer = await a.caller('maintainer')
    const answer = await maintainer.session().management.inspectIdle({
      ...a.access(),
      principal: 'system:maintainer',
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'sessionClock' } })
  })

  it('sessionIdleInput: inspect answers unavailable', async () => {
    const a = await build(['sessionIdleInput'])
    await a.provide(
      'sessionIdleInput',
      serviceOf(SessionIdleInputService, throwing('inspect'), 'Crashing'),
    )
    await a.create(await a.caller('intake'))
    const maintainer = await a.caller('maintainer')
    const answer = await maintainer.session().management.inspectIdle({
      ...a.access(),
      principal: 'system:maintainer',
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'sessionIdleInput' } })
  })

  it('sessionTransactions: the directory reads answer unavailable and the port is not wrapped', async () => {
    const a = await build(['sessionTransactions'])
    await a.provide(
      'sessionTransactions',
      serviceOf(SessionTransactionPortService, throwing('pending'), 'Crashing'),
    )
    const maintainer = await a.caller('maintainer')
    const answer = await maintainer.session().reconciliation.pending({
      principal: 'system:maintainer',
      tenant: a.tenant,
      after: null,
      limit: 5,
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'sessionTransactions' } })
  })
})

describe('the clock wait', () => {
  it('rejects the promise when the clock is absent, and passes a rejection of the clock on', async () => {
    const ctx = new Context()
    const diagnosed: string[] = []
    const ports = createPorts(ctx, detail => diagnosed.push(detail))
    const signal = new AbortController().signal
    await expect(ports.clock.waitUntil('2026-01-01T00:00:00.000Z', signal)).rejects.toThrow(
      /sessionClock is absent/,
    )
    await loose(ctx)(
      serviceOf(
        SessionClockService,
        { waitUntil: () => Promise.reject(new Error('clock refused')) },
        'RefusingClock',
      ),
    )
    await expect(ports.clock.waitUntil('2026-01-01T00:00:00.000Z', signal)).rejects.toThrow(
      /clock refused/,
    )
  })

  it('does not keep a reference across calls: the second call sees the provider that replaced the first', async () => {
    const ctx = new Context()
    const ports = createPorts(ctx, () => undefined)
    const signal = new AbortController().signal
    const first = await loose(ctx)(
      serviceOf(SessionClockService, { waitUntil: () => Promise.resolve('elapsed') }, 'First'),
    )
    expect(await ports.clock.waitUntil('2026-01-01T00:00:00.000Z', signal)).toBe('elapsed')
    await first.dispose()
    await loose(ctx)(
      serviceOf(SessionClockService, { waitUntil: () => Promise.resolve('cancelled') }, 'Second'),
    )
    expect(await ports.clock.waitUntil('2026-01-01T00:00:00.000Z', signal)).toBe('cancelled')
  })
})
