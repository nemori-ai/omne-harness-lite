// The plugin on real Cordis 4.0.4: when it loads, what stops it from loading, and what a change of
// a provider does to it (SPEC properties 1 to 4 and 10; verification 1, 7 and 9). The session
// instance inside is the real factory over the in-memory transaction pair; only the providers of
// the ports are small plugins of the test.
import { afterEach, describe, expect, it } from 'vitest'
import {
  assemble,
  FIBER_STATE,
  INJECTED,
  serviceOf,
  type Assembly,
  type PortName,
} from './fixtures/assembly.ts'
import { SessionClockService } from '@omne-harness/session-cordis-contract/cordis'
import { operationId, ordinaryInput } from '@omne-harness/session-contract/testing'

const open: Assembly[] = []
afterEach(async () => {
  for (const assembly of open.splice(0)) await assembly.close()
})

async function build(options: Parameters<typeof assemble>[0] = {}): Promise<Assembly> {
  const assembly = await assemble(options)
  open.push(assembly)
  return assembly
}

const provides = (assembly: Assembly): boolean => assembly.ctx.get('session') !== undefined

describe('loading', () => {
  it('provides session when the five injected keys are present, and the faces serve', async () => {
    const a = await build()
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(provides(a)).toBe(true)
    const intake = await a.caller('intake')
    const receipt = await a.create(intake)
    expect(receipt.revision).toBeDefined()
  })

  it.each(INJECTED)('stays PENDING without %s, and loads when it arrives', async missing => {
    const a = await build({ omit: [missing] })
    expect(a.provider.state as number).toBe(FIBER_STATE.PENDING)
    expect(provides(a)).toBe(false)
    await a.provide(missing)
    await a.provider.await()
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(provides(a)).toBe(true)
  })

  it('removes the key when the plugin stops', async () => {
    const a = await build()
    await a.provider.dispose()
    expect(provides(a)).toBe(false)
  })
})

describe('a port that is read per call does not decide whether the plugin loads', () => {
  const others = [
    'sessionTransactions',
    'sessionIdentity',
    'sessionEvidence',
    'sessionContextInput',
    'sessionIdleInput',
    'sessionClock',
    'sessionNotifier',
    'sessionAgentDrive',
    'sessionScopeRelease',
  ] as const satisfies readonly PortName[]

  it.each(others)('loads without %s', async missing => {
    const a = await build({ omit: [missing] })
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(provides(a)).toBe(true)
  })

  it('does not run the plugin body again when such a port changes its provider', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    const held = a.provider
    await a.create(intake)
    const registered = a.handles.get('session-provider')
    expect(intake.runs()).toBe(1)
    await a.withdraw('sessionClock')
    await a.provide('sessionClock', serviceOf(SessionClockService, {}, 'AnotherClock'))
    expect(a.provider).toBe(held)
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    // Neither the plugin body nor the caller plugin ran again.
    expect(Object.is(a.handles.get('session-provider'), registered)).toBe(true)
    expect(intake.runs()).toBe(1)
    await a.accept(intake, 'after-the-change')
  })
})

describe('a change of an injected provider', () => {
  it.each(INJECTED)('unloads the plugin and runs it again when %s is replaced', async key => {
    const a = await build()
    const intake = await a.caller('intake')
    expect(intake.runs()).toBe(1)
    expect(a.handles.size).toBe(1)
    await a.withdraw(key)
    await a.provider.await()
    // The body was unloaded first: the service is gone and its lifecycle registration with it.
    expect(provides(a)).toBe(false)
    expect(a.provider.state as number).toBe(FIBER_STATE.PENDING)
    expect(a.handles.size).toBe(0)
    await a.provide(key)
    await a.provider.await()
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(a.handles.size).toBe(1)
    // The caller plugin ran again and holds the new service, which works.
    await intake.ctx().fiber.await()
    expect(intake.runs()).toBe(2)
    expect((await a.create(intake)).revision).toBeDefined()
  })

  it('closes the old instance before the new one is built', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    const oldFaces = intake.session().work
    await a.withdraw('sessionPrincipals')
    await a.provider.await()
    // The face read before the change answers unavailable, because that instance is closed.
    const answer = await oldFaces.readWork(a.access())
    expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('the same command after a change', () => {
  it('is recognized by its operation identity and has no second effect', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    await a.create(intake)
    const first = await a.accept(intake, 'once')
    await a.withdraw('sessionWorkPrincipals')
    await a.provide('sessionWorkPrincipals')
    await a.provider.await()
    // The new instance holds nothing of the old one. The store answers the repeated operation.
    const again = await a.accept(intake, 'once')
    expect(again).toEqual({ ...first, recovered: true })
  })
})

describe('configuration', () => {
  it('a valid configuration loads and takes the given policy and wait limit', async () => {
    const a = await build({
      provider: { disposeWaitMs: 1234, policy: { recoveryScan: { pageSize: 7 } } },
    })
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
  })

  it.each([
    ['an unknown top-level field', { nope: 1 }, /unknown field nope/],
    ['a negative bound', { policy: { cache: { entryBudgetBytes: -1 } } }, /entryBudgetBytes/],
    ['a zero upper limit', { policy: { pendingResolution: { maxAttempts: 0 } } }, /maxAttempts/],
    ['an empty backoff sequence', { policy: { advance: { retryDelaysMs: [] } } }, /retryDelaysMs/],
    [
      'a non-finite number',
      { policy: { recoveryScan: { periodMs: Number.POSITIVE_INFINITY } } },
      /periodMs/,
    ],
    ['an unknown policy field', { policy: { cache: { entries: 1 } } }, /entries/],
    ['a prewarm switch that is on', { policy: { preEvaluation: { prewarm: true } } }, /prewarm/],
    ['a zero wait limit', { disposeWaitMs: 0 }, /disposeWaitMs/],
    ['an admission declaration other than none', { admission: 'all' }, /admission/],
  ])('%s fails the load: FAILED, no service, no instance', async (_name, config, message) => {
    const a = await build({ provider: config })
    expect(a.provider.state as number).toBe(FIBER_STATE.FAILED)
    expect(provides(a)).toBe(false)
    // The schema refused it: the error is Cordis's validation error, not one raised by a body.
    await expect(a.provider.await()).rejects.toMatchObject({ name: 'ValidationError' })
    await expect(a.provider.await()).rejects.toThrow(message)
    // The body did not run, so nothing registered itself with the lifecycle.
    expect(a.handles.size).toBe(0)
  })
})

describe('the admission declaration', () => {
  it('without it, accept answers unavailable: the intake slots have no key yet', async () => {
    const a = await build({ provider: {} })
    const intake = await a.caller('intake')
    await a.create(intake)
    const answer = await intake.session().work.accept({
      ...a.access(),
      operation: operationId('accept-undeclared'),
      value: ordinaryInput('undeclared'),
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'sessionAdmission' } })
  })

  it("with admission 'none', accept runs without slots", async () => {
    const a = await build({ provider: { admission: 'none' } })
    const intake = await a.caller('intake')
    await a.create(intake)
    expect((await a.accept(intake, 'declared')).revision).toBeDefined()
  })
})

describe('a second load under the same isolate label', () => {
  it('fails, and the first one keeps serving', async () => {
    const a = await build()
    const second = await a.load()
    expect(second.state as number).toBe(FIBER_STATE.FAILED)
    await expect(second.await()).rejects.toThrow(/session/)
    expect(a.handles.size).toBe(1)
    expect(provides(a)).toBe(true)
    const intake = await a.caller('intake')
    expect((await a.create(intake)).revision).toBeDefined()
  })
})
