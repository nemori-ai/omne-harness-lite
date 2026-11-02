// The removal of the plugin (SPEC property 9; verification 8) on real Cordis. Two triggers run the
// same four steps: the stop handle that the ordered shutdown calls, and the effect of the fiber
// (removal of the plugin, a provider change). The session factory is wrapped by a spy that counts
// `close`, `maintain` and the release of each scanner and changes nothing else; every other part is
// the real one. A gate in front of the delegated commit keeps one command in flight.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assemble, type Assembly } from './fixtures/assembly.ts'
import { resetSpies, spies } from './fixtures/session-spy.ts'

vi.mock('@omne-harness/session', async importOriginal => {
  const { spyOnSession } = await import('./fixtures/session-spy.ts')
  return spyOnSession(await importOriginal<typeof import('@omne-harness/session')>())
})

const open: Assembly[] = []
afterEach(async () => {
  for (const assembly of open.splice(0)) await assembly.close()
})

const ROW = 'session-provider'

async function build(options: Parameters<typeof assemble>[0] = {}): Promise<Assembly> {
  const assembly = await assemble(options)
  open.push(assembly)
  // The configuration check and the first load built probe instances; count from here.
  resetSpies()
  return assembly
}

const provides = (a: Assembly): boolean => a.ctx.get('session') !== undefined
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
const diagnostics = (a: Assembly): string[] =>
  a.ctx.logger.buffer.filter(m => m.name === 'session-provider').map(m => String(m.args[0]))

async function withScanner(options: Parameters<typeof assemble>[0] = {}) {
  const a = await build(options)
  const intake = await a.caller('intake')
  await a.create(intake)
  await expect.poll(() => spies.maintained).toBe(1)
  return { a, intake }
}

describe('the two triggers run the steps once', () => {
  it('the effect alone: scanner released, instance closed, service gone, registration withdrawn', async () => {
    const { a } = await withScanner()
    const held = a.ctx.get('session')!
    await a.provider.dispose()
    expect(spies).toMatchObject({ closed: 1, released: 1 })
    expect(provides(a)).toBe(false)
    expect(a.handles.has(ROW)).toBe(false)
    // A reference taken before the removal answers unavailable, not a result and not a throw.
    expect(await held.work.readWork(a.access())).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session' },
    })
  })

  it('the stop handle first, the effect after it: one close, one release, and a settled result', async () => {
    const { a } = await withScanner()
    const results = await a.shutdown()
    expect(results[ROW]).toEqual({ kind: 'settled' })
    expect(spies).toMatchObject({ closed: 1, released: 1 })
    await a.provider.dispose()
    expect(spies).toMatchObject({ closed: 1, released: 1 })
    expect(a.log).not.toContain(`withdrawal-stop:${ROW}`)
  })

  it('both at the same moment: one close, one release', async () => {
    const { a } = await withScanner()
    const handle = a.handles.get(ROW)!.handle
    const [stopped] = await Promise.all([handle.stop(0), a.provider.dispose()])
    expect(stopped).toEqual({ kind: 'settled' })
    expect(spies).toMatchObject({ closed: 1, released: 1 })
  })

  it('the effect first: the stop that the withdrawal starts waits for it and closes nothing again', async () => {
    const { a } = await withScanner()
    await a.provider.dispose()
    await delay(30)
    expect(a.log).toContain(`withdrawal-stop:${ROW}`)
    expect(spies).toMatchObject({ closed: 1, released: 1 })
  })

  it('a provider change runs the same steps before the body runs again', async () => {
    const { a } = await withScanner()
    await a.withdraw('sessionPrincipals')
    expect(spies).toMatchObject({ closed: 1, released: 1 })
    await a.provide('sessionPrincipals')
    await a.provider.await()
    const closedBefore = spies.closed
    // The new instance serves, and serving closes nothing.
    const intake = await a.caller('intake')
    await a.create(intake, 'session-2')
    expect(spies.closed).toBe(closedBefore)
  })
})

describe('a provider change while a command is in flight', () => {
  it('Cordis runs the body again only after the old removal has ended (the assumption of SPEC property 10)', async () => {
    const { a, intake } = await withScanner()
    const gate = a.hold()
    const inflight = a.accept(intake, 'held-over-the-change')
    await gate.arrived
    const withdrawing = a.withdraw('sessionPrincipals')
    const providing = a.provide('sessionPrincipals')
    await delay(150)
    // The replacement is mounted, yet the old removal still waits for its command: the new body
    // has not registered with the lifecycle and no service is offered.
    expect(a.handles.size).toBe(0)
    expect(provides(a)).toBe(false)

    gate.release()
    await Promise.all([withdrawing, providing])
    await a.provider.await()
    expect((await inflight).revision).toBeDefined()
    expect(a.handles.size).toBe(1)
    expect(provides(a)).toBe(true)
  })
})

describe('what a removal in progress does', () => {
  it('refuses the faces, hands on no notice, binds no scanner, sends no call, and lets the command in flight end', async () => {
    const a = await build()
    await a.listen()
    const intake = await a.caller('intake')
    a.bindings.controls.bind(a.tenant, a.sessionId('session-1'))
    await a.create(intake)
    await expect.poll(() => spies.maintained).toBe(1)
    await expect.poll(() => a.events.length).toBe(1)
    const notified = a.notifier.controls.notifications().length
    const service = a.ctx.get('session')!
    const scanners = a.hooks.pendingTenants.length

    const gate = a.hold()
    const inflight = a.accept(intake, 'in-flight')
    await gate.arrived
    let removed = false
    const removing = a.provider.dispose().then(() => {
      removed = true
    })
    await expect
      .poll(async () => await service.work.readWork(a.access()), { timeout: 2000 })
      .toMatchObject({ failure: { kind: 'unavailable', owner: 'session' } })
    // The faces refuse every class of caller, not only the one that was reading.
    expect(await service.history.next({ ...a.access(), cursor: '' as never })).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session' },
    })
    // A notice of another dispatcher neither wakes the instance nor binds a scanner.
    a.emitCommitted(
      a.other().tenant,
      a.sessionId('x'),
      '1',
      { owner: 'o', record: 'r', revision: '1', digest: 'd' },
      ['intake.routed'],
    )
    await delay(100)
    expect(a.hooks.pendingTenants.length).toBe(scanners)
    // The removal waits for the command in flight.
    expect(removed).toBe(false)
    // The listener of the test saw the foreign notice; the plugin dispatches nothing more.
    const dispatched = a.events.length

    gate.release()
    await removing
    // The command ended with its receipt, and the commit left no notice and no outbound call.
    expect((await inflight).revision).toBeDefined()
    await delay(100)
    expect(a.events).toHaveLength(dispatched)
    expect(a.notifier.controls.notifications()).toHaveLength(notified)
    expect(a.hooks.invoked).toHaveLength(0)
  })
})

describe('a scanner that is still starting when the removal begins', () => {
  it('releases itself when it arrives, so no scanner outlives the removal', async () => {
    // The startup read is a command in flight to the instance, so the wait for close ends by its limit.
    const a = await build({ provider: { admission: 'none', disposeWaitMs: 50 } })
    const intake = await a.caller('intake')
    let open!: () => void
    a.hooks.pendingGate = new Promise<void>(resolve => {
      open = resolve
    })
    await a.create(intake)
    // The startup scan of the new tenant is waiting for its first page.
    await expect.poll(() => a.hooks.pendingTenants.length).toBe(1)
    await a.provider.dispose()
    expect(spies).toMatchObject({ closed: 1, maintained: 0, released: 0 })

    open()
    await expect.poll(() => spies.maintained).toBe(1)
    await expect.poll(() => spies.released).toBe(1)
  })
})

describe('the window between the first step and close', () => {
  // The instance wakes its own advance after a local commit until `close` is called, so a command
  // that ends inside this window may still start work of its own; the window is the time of the
  // release of the scanners, which is not a wait. The notice is the plugin's own act and is held back.
  it('a commit that completes there hands on no notice', async () => {
    const a = await build()
    await a.listen()
    const intake = await a.caller('intake')
    await a.create(intake)
    await expect.poll(() => spies.maintained).toBe(1)
    await expect.poll(() => a.events.length).toBe(1)
    const notified = a.notifier.controls.notifications().length

    const commit = a.hold()
    const inflight = a.accept(intake, 'between')
    await commit.arrived
    // The release of the scanner is held, so the removal stays after its first step and before close.
    let letReleaseGo!: () => void
    spies.releaseGate = new Promise<void>(resolve => {
      letReleaseGo = resolve
    })
    const removing = a.provider.dispose()
    await expect.poll(() => spies.released).toBe(1)
    expect(spies.closed).toBe(0)

    commit.release()
    expect((await inflight).revision).toBeDefined()
    await delay(100)
    letReleaseGo()
    await removing
    expect(a.events).toHaveLength(1)
    expect(a.notifier.controls.notifications()).toHaveLength(notified)
  })
})

describe('the wait for close', () => {
  it('ends at disposeWaitMs with an incomplete result, a diagnostic, and the command still ends with its receipt', async () => {
    const { a, intake } = await withScanner({ provider: { admission: 'none', disposeWaitMs: 60 } })
    const gate = a.hold()
    const inflight = a.accept(intake, 'slow')
    await gate.arrived
    const handle = a.handles.get(ROW)!.handle
    const started = Date.now()
    const result = await handle.stop(0)
    const waited = Date.now() - started
    expect(result).toMatchObject({ kind: 'incomplete', detail: expect.stringContaining('60 ms') })
    expect(waited).toBeGreaterThanOrEqual(50)
    expect(waited).toBeLessThan(1500)
    expect(diagnostics(a).some(text => text.includes('did not stop within 60 ms'))).toBe(true)

    // The timeout is not a stop: the command in flight ends with a receipt after the gate opens.
    gate.release()
    expect((await inflight).revision).toBeDefined()
  })
})

describe('a step that throws', () => {
  it('is recorded and the next steps still run: close is called, and the result is failed', async () => {
    const { a } = await withScanner()
    spies.releaseThrows = true
    const result = await a.handles.get(ROW)!.handle.stop(0)
    expect(result).toMatchObject({
      kind: 'failed',
      detail: expect.stringContaining('release crashed'),
    })
    expect(spies.closed).toBe(1)
    expect(diagnostics(a).some(text => text.includes('release crashed'))).toBe(true)
  })

  it('close that rejects is recorded and the result is failed', async () => {
    const { a } = await withScanner()
    spies.closeThrows = true
    const result = await a.handles.get(ROW)!.handle.stop(0)
    expect(result).toMatchObject({
      kind: 'failed',
      detail: expect.stringContaining('close crashed'),
    })
    await a.provider.dispose()
    expect(spies.closed).toBe(1)
  })
})

describe('the ordered shutdown', () => {
  it('stops session-provider first, and the storage row stops after the command in flight has ended', async () => {
    const { a, intake } = await withScanner()
    await a.mountStorageRow()
    a.log.length = 0
    const gate = a.hold()
    const inflight = a.accept(intake, 'last-command')
    await gate.arrived

    const shutting = a.shutdown()
    await delay(100)
    // The storage row has not been asked to stop while the provider still waits for its command.
    expect(a.log).toContain(`stop:${ROW}`)
    expect(a.log).not.toContain('stop:session-storage')

    gate.release()
    const results = await shutting
    expect((await inflight).revision).toBeDefined()
    expect(results[ROW]).toEqual({ kind: 'settled' })
    // The commit settled before the provider reported stopped, and the storage closed after that.
    const order = [
      'commit-settled',
      `stopped:${ROW}`,
      'stop:session-storage',
      'storage-closed',
    ].map(entry => a.log.indexOf(entry))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })
})
