import { describe, expect, it } from 'vitest'
import { chmod, mkdir, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isOk, parseTenantId } from '@omne-harness-lite/identity-values'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { openDemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { createDemoDiagnosticConfig, ensureDemoDiagnosticParent } from '../src/demo.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'
import { activateModelFixture, actor } from './support.ts'
import { createLocalTls } from './local-tls.ts'

async function registryRows(scope: Awaited<ReturnType<typeof activateModelFixture>>['local']) {
  const result = await scope.query({ scope: scope.scope, limit: 128, maxBytes: 1_048_576 })
  if (!('page' in result)) throw new Error(`local diagnostic query rejected: ${result.rejected}`)
  return result.page.records.filter(
    record =>
      record.source === 'transport' &&
      (record.stage === 'registration' || record.stage === 'retirement'),
  )
}

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
      const forgedTenant = parseTenantId({
        organization: 'diagnostic-forged-organization',
        account: authenticated.account,
      })
      if (!isOk(forgedTenant)) throw new Error('forged tenant fixture invalid')
      const forgedActor = { ...authenticated, tenant: forgedTenant.ok }
      expect(
        await app.activateModelRequest(forgedActor, diagnostics, diagnostics.transports),
      ).toEqual({ failure: 'identityMismatch' })
      expect(createdTransportFibers).toBe(0)
      expect(
        await app.activateModelRequest(
          authenticated,
          { local: diagnostics.tenant, tenant: diagnostics.tenant },
          diagnostics.transports,
        ),
      ).toEqual({ failure: 'identityMismatch' })
      expect(createdTransportFibers).toBe(0)
      expect(app.status().serving).toBe(false)
      const other = await actor(app, 'diagnostic-other')
      expect(await app.activateModelRequest(other, diagnostics, diagnostics.transports)).toEqual({
        failure: 'identityMismatch',
      })
      expect(createdTransportFibers).toBe(0)
      expect(
        await app.activateModelRequest(authenticated, diagnostics, diagnostics.transports),
      ).toEqual({ activated: true })
      expect(createdTransportFibers).toBe(1)
      expect(app.status().serving).toBe(true)
      expect(
        await app.activateModelRequest(
          authenticated,
          { local: diagnostics.local, tenant: diagnostics.tenant },
          diagnostics.transports,
        ),
      ).toEqual({ activated: true })
      expect(createdTransportFibers).toBe(1)
      const copiedActor = { ...authenticated }
      expect(
        await app.activateModelRequest(copiedActor, diagnostics, diagnostics.transports),
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
    const live = await openDemoDiagnosticAssembly(
      createDemoDiagnosticConfig(directory, authenticated.tenant, demoRetirement()),
    )
    try {
      expect(
        await app.activateModelRequest(
          authenticated,
          { local: diagnostics.local, tenant: live.tenant },
          live.transports,
        ),
      ).toEqual({ failure: 'stageClosed' })
      expect(createdTransportFibers).toBe(0)
      expect((await app.close()).complete).toBe(true)
    } finally {
      expect((await live.closeAfterBusiness(() => app.close())).complete).toBe(true)
    }
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
      const generation = opened.live[0]?.generation
      if (generation === undefined) throw new Error('transport generation missing')
      expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
      expect(tracker.health().transportTerminalSnapshots).toBe(1)
      expect(tracker.health().transportLiveInstances).toBe(0)
      const rows = await registryRows(diagnostics.local)
      expect(rows.map(record => record.stage)).toContain('registration')
      expect(rows.map(record => record.stage)).toContain('retirement')
      expect(rows.every(record => record.scope.kind === 'local')).toBe(true)
      expect(
        rows.every(record => record.association?.executionId === `transport:${generation}`),
      ).toBe(true)
      const tenantRows = await diagnostics.tenant.query({
        scope: diagnostics.tenant.scope,
        limit: 128,
        maxBytes: 1_048_576,
      })
      if (!('page' in tenantRows)) throw new Error('tenant diagnostic query rejected')
      expect(
        tenantRows.page.records.some(
          record =>
            record.source === 'transport' &&
            (record.stage === 'registration' || record.stage === 'retirement'),
        ),
      ).toBe(false)
      expect(tracker.health().terminal[0]?.inspect.registryDiagnosticFailures).toBe(0)
      expect(tracker.health().terminal[0]?.inspect.registryDiagnosticDropped).toBe(0)
    } finally {
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
    }
  })

  it('connects the controlled TLS service construction to the same local registry journal', async () => {
    const config = await callDeployment('diagnostic-controlled-transport')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const authenticated = await actor(app)
      diagnostics = await activateModelFixture(app, authenticated, config)
      const generation = diagnostics.transports.health().live[0]?.generation
      if (generation === undefined) throw new Error('controlled transport generation missing')
      expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
      const rows = await registryRows(diagnostics.local)
      expect(rows.map(record => record.stage)).toContain('registration')
      expect(rows.map(record => record.stage)).toContain('retirement')
      expect(
        rows.every(record => record.association?.executionId === `transport:${generation}`),
      ).toBe(true)
      expect(tls.requests).toHaveLength(0)
    } finally {
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })

  it.each(['throw', 'drop'] as const)(
    'retains %s registry diagnostic delivery counters on the live and terminal service',
    async mode => {
      const config = await callDeployment(`diagnostic-registry-${mode}`)
      const app = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        diagnostics: { record() {} },
      })
      await app.ready
      const authenticated = await actor(app)
      const directory = dirname(config.databaseFile)
      await mkdir(join(directory, 'diagnostics'), { mode: 0o700 })
      const diagnostics = await openDemoDiagnosticAssembly(
        createDemoDiagnosticConfig(directory, authenticated.tenant, demoRetirement()),
      )
      const local = {
        ...diagnostics.local,
        collector: {
          ...diagnostics.local.collector,
          record() {
            if (mode === 'throw') throw new Error('controlled registry diagnostic rejection')
            return { dropped: 'queue_full' as const }
          },
        },
      }
      try {
        expect(
          await app.activateModelRequest(
            authenticated,
            { local, tenant: diagnostics.tenant },
            diagnostics.transports,
          ),
        ).toEqual({ activated: true })
        const live = diagnostics.transports.health().live[0]?.inspect
        if (
          !live ||
          typeof live.registryDiagnosticFailures !== 'number' ||
          typeof live.registryDiagnosticDropped !== 'number'
        )
          throw new Error('precise live registry diagnostic counters unavailable')
        expect(live?.registrations).toBe(1)
        if (mode === 'throw') {
          expect(live.registryDiagnosticFailures).toBeGreaterThan(0)
          expect(live.registryDiagnosticDropped).toBe(0)
        } else {
          expect(live.registryDiagnosticDropped).toBeGreaterThan(0)
          expect(live.registryDiagnosticFailures).toBe(0)
        }
        expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
        const final = diagnostics.transports.health().terminal[0]?.inspect
        if (mode === 'throw') {
          expect(final?.registryDiagnosticFailures).toBeGreaterThanOrEqual(
            live.registryDiagnosticFailures,
          )
          expect(final?.registryDiagnosticDropped).toBe(0)
        } else {
          expect(final?.registryDiagnosticDropped).toBeGreaterThanOrEqual(
            live.registryDiagnosticDropped,
          )
          expect(final?.registryDiagnosticFailures).toBe(0)
        }
      } finally {
        await diagnostics.closeAfterBusiness(() => app.close())
      }
    },
  )

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
    await expect(app.activateModelRequest(authenticated, diagnostics, tracker)).rejects.toThrow()
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
