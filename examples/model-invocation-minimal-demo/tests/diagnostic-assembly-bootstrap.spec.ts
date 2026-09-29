import { describe, expect, it } from 'vitest'
import { chmod, mkdir, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { openDemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { createDemoDiagnosticConfig, ensureDemoDiagnosticParent } from '../src/demo.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'
import { activateModelFixture, actor } from './support.ts'

describe('demo transport diagnostic retention at the real bootstrap', () => {
  it('rejects a wide or linked diagnostic parent before opening writers', async () => {
    const wide = await callDeployment('diagnostic-wide-parent')
    const wideParent = join(dirname(wide.databaseFile), 'diagnostics')
    await mkdir(wideParent, { mode: 0o700 })
    await chmod(wideParent, 0o755)
    await expect(ensureDemoDiagnosticParent(dirname(wide.databaseFile))).rejects.toThrow(
      'diagnostic parent must be an owned private directory',
    )
    const linked = await callDeployment('diagnostic-linked-parent')
    const linkedRoot = dirname(linked.databaseFile)
    await mkdir(join(linkedRoot, 'owned-target'), { mode: 0o700 })
    await symlink(join(linkedRoot, 'owned-target'), join(linkedRoot, 'diagnostics'))
    await expect(ensureDemoDiagnosticParent(linkedRoot)).rejects.toThrow(
      'diagnostic parent must be an owned private directory',
    )
  })

  it('keeps P-2 closed until a verified actor presents its matching tenant owner', async () => {
    const config = await callDeployment('diagnostic-tenant-gate')
    let createdTransportFibers = 0
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      diagnostics: { record() {} },
      hooks: {
        fiberCreated(name) {
          if (name === 'modelTransport') createdTransportFibers++
        },
      },
    })
    await app.ready
    expect(app.status().serving).toBe(false)
    const authenticated = await actor(app)
    const directory = dirname(config.databaseFile)
    await mkdir(join(directory, 'diagnostics'), { mode: 0o700 })
    const diagnostics = await openDemoDiagnosticAssembly(
      createDemoDiagnosticConfig(directory, authenticated.tenant, demoRetirement()),
    )
    try {
      expect(
        await app.activateModelRequest(authenticated, diagnostics.local, diagnostics.transports),
      ).toEqual({ failure: 'identityMismatch' })
      expect(createdTransportFibers).toBe(0)
      expect(app.status().serving).toBe(false)
      expect(
        await app.activateModelRequest(authenticated, diagnostics.tenant, diagnostics.transports),
      ).toEqual({ activated: true })
      expect(createdTransportFibers).toBe(1)
      expect(app.status().serving).toBe(true)
      const forgedActor = { ...authenticated }
      expect(
        await app.activateModelRequest(forgedActor, diagnostics.tenant, diagnostics.transports),
      ).toEqual({ failure: 'identityMismatch' })
    } finally {
      await diagnostics.closeAfterBusiness(() => app.close())
    }
  })

  it('does not activate P-2 with a diagnostic writer that has already closed', async () => {
    const config = await callDeployment('diagnostic-closed-writer')
    let createdTransportFibers = 0
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      diagnostics: { record() {} },
      hooks: {
        fiberCreated(name) {
          if (name === 'modelTransport') createdTransportFibers++
        },
      },
    })
    await app.ready
    const authenticated = await actor(app)
    const directory = dirname(config.databaseFile)
    await mkdir(join(directory, 'diagnostics'), { mode: 0o700 })
    const diagnostics = await openDemoDiagnosticAssembly(
      createDemoDiagnosticConfig(directory, authenticated.tenant, demoRetirement()),
    )
    expect((await diagnostics.closeAfterBusiness(async () => ({ complete: true }))).complete).toBe(
      true,
    )
    expect(
      await app.activateModelRequest(authenticated, diagnostics.tenant, diagnostics.transports),
    ).toEqual({ failure: 'stageClosed' })
    expect(createdTransportFibers).toBe(0)
    expect((await app.close()).complete).toBe(true)
  })

  it('tracks the actual Cordis transport service through application close', async () => {
    const config = await callDeployment('diagnostic-transport-owner')
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      diagnostics: { record() {} },
    })
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const authenticated = await actor(app)
      diagnostics = await activateModelFixture(app, authenticated, config)
      const tracker = diagnostics.transports
      const opened = tracker.health()
      expect(opened.transportLiveInstances).toBe(1)
      expect(opened.live[0]?.role).toBe('current')
      expect(opened.live[0]?.inspect?.registrations).toBe(1)
      expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
      const generation = opened.live[0]?.generation
      if (generation === undefined) throw new Error('transport generation missing')
      expect(tracker.health().transportTerminalSnapshots).toBe(1)
      expect(tracker.health().transportLiveInstances).toBe(0)
    } finally {
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
    }
  })

  it('refuses startup before creating the transport fiber when the shared limit is full', async () => {
    const config = await callDeployment('diagnostic-transport-full')
    let createdTransportFibers = 0
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      diagnostics: { record() {} },
      hooks: {
        fiberCreated(name) {
          if (name === 'modelTransport') createdTransportFibers++
        },
      },
    })
    await app.ready
    const authenticated = await actor(app)
    const directory = dirname(config.databaseFile)
    await mkdir(join(directory, 'diagnostics'), { mode: 0o700 })
    const diagnostics = await openDemoDiagnosticAssembly({
      ...createDemoDiagnosticConfig(directory, authenticated.tenant, demoRetirement()),
      transportRetainedInstancesMax: 1,
    })
    const tracker = diagnostics.transports
    const held = tracker.reserveReplacement()
    if (!('reservation' in held)) throw new Error('initial reservation missing')
    held.reservation.abortUnknown()
    await expect(
      app.activateModelRequest(authenticated, diagnostics.tenant, tracker),
    ).rejects.toThrow()
    expect(createdTransportFibers).toBe(0)
    expect(tracker.health()).toMatchObject({
      transportLiveInstances: 0,
      transportReservedInstances: 1,
      transportReplacementRefusals: 1,
    })
    expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(false)
    held.reservation.abortNoResources()
    expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
  })
})
