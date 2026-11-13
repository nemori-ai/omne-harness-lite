// The commit notice and the scanner binding (SPEC properties 5 and 7; verification 5 and 6) on real
// Cordis. The plugin dispatches no notice: it listens for `session-cordis-contract/committed`,
// wakes its instance on each notice and binds one recovery scanner for each tenant it sees. The
// scanner is observed through the `pending` reads of its startup scan on the public transaction
// port.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SessionTenantSourceService,
  type SessionTenantSource,
} from '@omne-harness/session-cordis-contract/cordis'
import { evidence } from '@omne-harness/session-contract/testing'
import { assemble, serviceOf, type Assembly } from './fixtures/assembly.ts'
import { resetSpies, spies } from './fixtures/session-spy.ts'

vi.mock('@omne-harness/session', async importOriginal => {
  const { spyOnSession } = await import('./fixtures/session-spy.ts')
  return spyOnSession(await importOriginal<typeof import('@omne-harness/session')>())
})

const open: Assembly[] = []
afterEach(async () => {
  for (const assembly of open.splice(0)) await assembly.close()
})

async function build(options: Parameters<typeof assemble>[0] = {}): Promise<Assembly> {
  const assembly = await assemble(options)
  open.push(assembly)
  resetSpies()
  return assembly
}

const COMMITTED = 'session-cordis-contract/committed'

/** Diagnostics of the plugin, as the Cordis logger recorded them. */
const diagnostics = (a: Assembly): string[] =>
  a.ctx.logger.buffer.filter(m => m.name === 'session-provider').map(m => String(m.args[0]))

describe('the plugin sends no notice of its own', () => {
  // The one writer of the session log tells each batch; the application registers the notifier of
  // `createSessionCommitNotifier` on its storage (tests/commit-notifier.spec.ts). The store here
  // registers none, so a commit through the plugin dispatches nothing and hands nothing on.
  it('a commit through the plugin dispatches no event and hands nothing to sessionNotifier', async () => {
    const a = await build({ notices: false })
    await a.listen()
    const intake = await a.caller('intake')
    expect((await a.create(intake)).revision).toBeDefined()
    expect((await a.accept(intake, 'one')).revision).toBeDefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(a.events).toEqual([])
    expect(a.notifier.controls.notifications()).toEqual([])
  })
})

describe('a notice wakes the instance, whoever dispatched it', () => {
  it('a notice of a commit of this instance wakes it once more and commits nothing it does not ask for', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    a.bindings.controls.bind(a.tenant, a.sessionId('session-1'))
    await a.create(intake)
    const accepted = await a.accept(intake, 'wake-twice')
    // The instance advances the session once: one Run starts and the Agent drive is invoked.
    await expect.poll(() => a.hooks.invoked.length, { timeout: 5000 }).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 200))
    const commits = () => a.log.filter(step => step === 'commit-settled').length
    const before = commits()
    // The notice the writer gives for the accept batch reaches the plugin as well: it wakes again.
    await a.ctx.parallel(
      COMMITTED,
      a.tenant,
      a.sessionId('session-1'),
      accepted.revision,
      accepted.source,
      ['message.user', 'intake.routed'],
    )
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(commits()).toBe(before)
    expect(a.hooks.invoked).toHaveLength(1)
  })
})

describe('a notice from any dispatcher', () => {
  it('wakes the instance: a session whose principal was refused is advanced after the notice', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    // The session is not bound yet, so the work principal is refused and S1 cannot advance it.
    await a.create(intake)
    const accepted = await a.accept(intake, 'wait-for-wake')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(a.hooks.invoked).toHaveLength(0)

    a.bindings.controls.bind(a.tenant, a.sessionId('session-1'))
    await a.ctx.parallel(
      COMMITTED,
      a.tenant,
      a.sessionId('session-1'),
      accepted.revision,
      accepted.source,
      ['intake.routed'],
    )
    await expect.poll(() => a.hooks.invoked.length, { timeout: 5000 }).toBe(1)
  })

  it('binds a scanner for a tenant that the instance never committed for', async () => {
    const a = await build()
    expect(a.hooks.pendingTenants).toHaveLength(0)
    a.emitCommitted(a.other().tenant, a.sessionId('elsewhere'), '1', evidence('x'), [])
    await expect.poll(() => a.hooks.pendingTenants.length).toBeGreaterThan(0)
    expect(a.hooks.pendingTenants.map(tenant => JSON.stringify(tenant))).toEqual([
      JSON.stringify(a.other().tenant),
    ])
  })

  it('an unminted tenant binds nothing and is recorded', async () => {
    const a = await build()
    a.emitCommitted({ not: 'a tenant' }, a.sessionId('x'), '1', evidence('x'), [])
    await expect.poll(() => diagnostics(a).some(text => text.includes('did not mint'))).toBe(true)
    expect(a.hooks.pendingTenants).toHaveLength(0)
  })
})

describe('one scanner for each tenant', () => {
  it('starts when a tenant is first seen and not again for its later commits', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    await a.create(intake)
    await expect.poll(() => a.hooks.pendingTenants.length).toBe(1)
    await a.accept(intake, 'one')
    await a.accept(intake, 'two')
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(a.hooks.pendingTenants).toHaveLength(1)
    // The table answers the later notices; the instance is not asked again.
    expect(spies.maintainCalls).toBe(1)
  })

  it('starts one more for another tenant', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    await a.create(intake)
    await a.create(intake, 'session-b', a.other)
    await expect.poll(() => a.hooks.pendingTenants.length).toBe(2)
    const [first, second] = a.hooks.pendingTenants
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second))
  })

  it('after a failed start the tenant is tried again at its next notice, and then once', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    a.hooks.failPending = 1
    await a.create(intake)
    await expect.poll(() => a.hooks.pendingTenants.length).toBe(1)
    await expect
      .poll(() => diagnostics(a).some(text => text.includes('maintain for tenant')))
      .toBe(true)
    // No retry on its own.
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(a.hooks.pendingTenants).toHaveLength(1)

    await a.accept(intake, 'second-notice')
    await expect.poll(() => a.hooks.pendingTenants.length).toBe(2)
    await a.accept(intake, 'third-notice')
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(a.hooks.pendingTenants).toHaveLength(2)
    expect(spies.maintainCalls).toBe(2)
  })
})

describe('the start scans the tenants of the deployment', () => {
  /** Mounts the tenant source of the application assembly with this answer. */
  const source = (a: Assembly, enumerate: SessionTenantSource['enumerate']) =>
    a.mount(serviceOf(SessionTenantSourceService, { enumerate }, 'Tenants'))
  const start = (a: Assembly) => {
    const entry = a.handles.get('session-provider')
    if (entry === undefined) throw new Error('the provider registered no handle')
    return entry.handle.start()
  }

  it('binds a scanner for each tenant the source names, before any notice', async () => {
    const a = await build()
    await source(a, () => Promise.resolve({ ok: [a.tenant, a.other().tenant] }))
    await start(a)
    await expect.poll(() => a.hooks.pendingTenants.length).toBe(2)
    expect(a.hooks.pendingTenants.map(tenant => JSON.stringify(tenant)).sort()).toEqual(
      [JSON.stringify(a.tenant), JSON.stringify(a.other().tenant)].sort(),
    )
    // A later notice of a tenant that the start bound starts no second scanner.
    const intake = await a.caller('intake')
    await a.create(intake)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(spies.maintainCalls).toBe(2)
  })

  it('without the source the start binds nothing and says so; notices still bind', async () => {
    const a = await build()
    await start(a)
    expect(diagnostics(a).some(text => text.includes('sessionTenants is absent'))).toBe(true)
    expect(a.hooks.pendingTenants).toHaveLength(0)
    const intake = await a.caller('intake')
    await a.create(intake)
    await expect.poll(() => a.hooks.pendingTenants.length).toBe(1)
  })

  it('a source that fails or throws binds nothing and is recorded', async () => {
    const a = await build()
    const fiber = await source(a, () =>
      Promise.resolve({ failure: { kind: 'unavailable', diagnostic: 'the directory is closed' } }),
    )
    await start(a)
    expect(
      diagnostics(a).some(text => text.includes('answered unavailable: the directory is closed')),
    ).toBe(true)
    await fiber.dispose()
    await source(a, () => Promise.reject(new Error('boom')))
    await start(a)
    expect(diagnostics(a).some(text => text.includes('sessionTenants threw'))).toBe(true)
    expect(a.hooks.pendingTenants).toHaveLength(0)
  })
})
