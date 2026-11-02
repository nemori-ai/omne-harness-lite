// The commit notice and the scanner binding (SPEC properties 5 and 7; verification 5 and 6) on real
// Cordis. The plugin dispatches `session-cordis-contract/committed` once for each commit, hands the
// same payload to `sessionNotifier` when there is one, listens for notices of other dispatchers,
// and binds one recovery scanner for each tenant it sees. The scanner is observed through the
// `pending` reads of its startup scan on the public transaction port.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionNotifierService } from '@omne-harness/session-cordis-contract/cordis'
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

describe('the notice of a commit', () => {
  it('is dispatched once for each commit, with identities, revision, evidence and kinds, and no text', async () => {
    const a = await build()
    await a.listen()
    const intake = await a.caller('intake')
    const created = await a.create(intake)
    await expect.poll(() => a.events.length).toBe(1)
    const [tenant, session, revision, source, kinds] = a.events[0]!
    expect(tenant).toEqual(a.tenant)
    expect(session).toBe('session-1')
    expect(revision).toBe(created.revision)
    expect(source).toEqual(created.source)
    expect(Array.isArray(kinds) && kinds.length > 0).toBe(true)

    const accepted = await a.accept(intake, 'one', 'session-1', 'secret-text-of-the-message')
    await expect.poll(() => a.events.length).toBe(2)
    expect(a.events[1]![2]).toBe(accepted.revision)
    expect(
      JSON.stringify(a.events, (_key, value: unknown) =>
        typeof value === 'bigint' ? String(value) : value,
      ),
    ).not.toContain('secret-text-of-the-message')
  })

  it('a listener that throws changes neither the receipt nor the next commit, and the fault is recorded', async () => {
    const a = await build()
    await a.mount({
      name: 'failing-listener',
      apply: (inner: import('@deepseek-ai/cordis').Context) => {
        inner.on(COMMITTED, () => {
          throw new Error('listener exploded')
        })
      },
    })
    const intake = await a.caller('intake')
    const created = await a.create(intake)
    expect(created.revision).toBeDefined()
    await expect
      .poll(() => diagnostics(a).some(text => text.includes('listener exploded')))
      .toBe(true)
    // The commit path was not waiting: the next command is served as before.
    expect((await a.accept(intake, 'next')).revision).toBeDefined()
  })

  it('is handed to sessionNotifier with the same payload', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    const created = await a.create(intake)
    await expect.poll(() => a.notifier.controls.notifications().length).toBe(1)
    const [notice] = a.notifier.controls.notifications()
    expect(notice).toMatchObject({
      tenant: a.tenant,
      session: 'session-1',
      revision: created.revision,
      source: created.source,
    })
  })

  it('goes on without sessionNotifier', async () => {
    const a = await build({ omit: ['sessionNotifier'] })
    await a.listen()
    const intake = await a.caller('intake')
    expect((await a.create(intake)).revision).toBeDefined()
    await expect.poll(() => a.events.length).toBe(1)
  })

  it('a sessionNotifier that fails changes no receipt, and the dispatch to listeners is not lost', async () => {
    const a = await build({ omit: ['sessionNotifier'] })
    await a.provide(
      'sessionNotifier',
      serviceOf(
        SessionNotifierService,
        { committed: () => Promise.reject(new Error('relay is down')) },
        'FailingNotifier',
      ),
    )
    await a.listen()
    const intake = await a.caller('intake')
    const created = await a.create(intake)
    expect(created.revision).toBeDefined()
    await expect.poll(() => a.events.length).toBe(1)
    await expect.poll(() => diagnostics(a).some(text => text.includes('relay is down'))).toBe(true)
  })
})

describe('a notice from another dispatcher', () => {
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
