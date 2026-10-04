import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {openRouterCredentialRedactionConfig} from '@omne-harness-lite/model-request-runtime'
import type {DiagnosticScope} from '@omne-harness-lite/model-request-runtime-local'
import {
  createDeepSeekV41FlashInputMeter,
  createModelTransportService,
  createOfficialProfileContent,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '@omne-harness-lite/pi-ai-transport'
import type {ModelTransportService} from '@omne-harness-lite/model-request-runtime'
import type { RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import {
  createDemoTransportRetention,
  openDemoDiagnosticAssembly,
  type DemoDiagnosticConfig,
} from '../src/diagnostic-assembly.ts'

const tenantId = unwrap(parseTenantId({ organization: 'diagnostic-org', account: 'account-a' }))
const tenant: DiagnosticScope = {
  kind: 'tenant',
  tenant: tenantId,
}
const otherTenant: DiagnosticScope = {
  kind: 'tenant',
  tenant: unwrap(parseTenantId({ organization: 'diagnostic-org', account: 'account-b' })),
}
const local: DiagnosticScope = { kind: 'local' }
const temporaryRoot = resolve(process.cwd(), '../../tmp')
let directory: string

beforeEach(async () => {
  await fs.mkdir(temporaryRoot, { recursive: true })
  directory = await fs.mkdtemp(join(temporaryRoot, 'diagnostic-assembly-'))
})
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

function policy(): RetirementPolicy {
  return {
    waitMilliseconds: 100,
    force: false,
    schedule(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds)
      return () => clearTimeout(timer)
    },
  }
}

function config(): DemoDiagnosticConfig {
  return {
    local: { rootDir: join(directory, 'local'), collectorId: 'local-engineering' },
    tenant: {
      rootDir: join(directory, 'tenant'),
      collectorId: 'tenant-engineering',
      tenant: tenantId,
    },
    collector: {
      maxRecordBytes: 1024,
      maxFieldBytes: 256,
      queueMaxRecords: 8,
      queueMaxBytes: 4096,
      segmentMaxBytes: 2048,
      retainedMaxBytes: 4096,
      retainedMaxSegments: 2,
      retentionMs: 60_000,
      queryMaxRecords: 4,
      queryMaxBytes: 2048,
      queryScanMaxBytes: 2048,
      queryConcurrency: 1,
      queryMaxDurationMs: 100,
      exportMaxRecords: 4,
      exportMaxBytes: 2048,
      closeWaitMs: 100,
      stderrMaxReports: 2,
      wallClock: () => new Date('2026-09-28T20:30:00.000Z'),
      monotonicClock: () => 30_000,
      schedule(milliseconds, callback) {
        const timer = setTimeout(callback, milliseconds)
        return { cancel: () => clearTimeout(timer) }
      },
    },
    transportRetainedInstancesMax: 2,
    transportRetirement: policy(),
  }
}

function fakeTransport(initialPending = 0): {
  readonly service: ModelTransportService
  readonly setPending: (pending: number) => void
  readonly resolveClosed: () => void
  readonly closeCalls: () => number
} {
  let pending = initialPending
  let calls = 0
  let resolveClosed = () => {}
  const closed = new Promise<void>(resolve => {
    resolveClosed = resolve
  })
  const service: ModelTransportService = {
    closed,
    clearReuseScope() {},
    diagnostics: () => ({ failed: 0, pending, dropped: 0 }),
    inspect: () => ({
      accepting: calls === 0,
      registrations: 0,
      retiring: 0,
      references: 0,
      executions: 0,
      cleanupFailures: 0,
      registryDiagnosticFailures: 0,
      registryDiagnosticDropped: 0,
    }),
    async close() {
      calls++
      resolveClosed()
      return { retired: true }
    },
    async retire() {
      return { rejected: 'invalidInput' }
    },
    registerAdaptation() {
      return { rejected: 'invalidInput' }
    },
    acquire() {
      return { rejected: 'unavailable' }
    },
  }
  return {
    service,
    setPending(value) {
      pending = value
    },
    resolveClosed,
    closeCalls: () => calls,
  }
}

describe('demo diagnostic assembly', () => {
  it('uses the retained reader clock for logical TTL after business and writers close', async () => {
    let now = Date.parse('2026-09-28T20:30:00.000Z')
    const baseline = config()
    const assembly = await openDemoDiagnosticAssembly({
      ...baseline,
      collector: {
        ...baseline.collector,
        retentionMs: 1_000,
        wallClock: () => new Date(now),
      },
    })
    const accepted = assembly.tenant.collector.record(
      {
        source: 'assembly',
        stage: 'assembly',
        outcome: 'completed',
        facts: { kind: 'diagnostics', reason: 'close_incomplete' },
      },
      tenant,
    )
    expect('recorded' in accepted).toBe(true)
    expect((await assembly.closeAfterBusiness(async () => ({ complete: true }))).complete).toBe(
      true,
    )
    const before = await assembly.tenant.query({ scope: tenant, limit: 4, maxBytes: 2048 })
    expect('page' in before && before.page.records).toHaveLength(1)
    now -= 1
    expect(await assembly.tenant.query({ scope: tenant, limit: 4, maxBytes: 2048 })).toEqual({
      rejected: 'unavailable',
    })
    now += 1_002
    const expired = await assembly.tenant.query({ scope: tenant, limit: 4, maxBytes: 2048 })
    expect('page' in expired && expired.page.records).toHaveLength(0)
    expect('page' in expired && expired.page.coverage).toBe('degraded')
    now = Number.NaN
    expect(await assembly.tenant.query({ scope: tenant, limit: 4, maxBytes: 2048 })).toEqual({
      rejected: 'unavailable',
    })
  })

  it('keeps real local and tenant journal rows apart, including export after the writer closes', async () => {
    const assembly = await openDemoDiagnosticAssembly(config())
    const localResult = assembly.local.collector.record(
      {
        source: 'assembly',
        stage: 'assembly',
        outcome: 'completed',
        facts: { kind: 'diagnostics', reason: 'close_incomplete' },
      },
      local,
    )
    const tenantResult = assembly.tenant.collector.record(
      {
        source: 'assembly',
        stage: 'assembly',
        outcome: 'unavailable',
        facts: { kind: 'diagnostics', reason: 'transport_retention_full' },
      },
      tenant,
    )
    expect('recorded' in localResult).toBe(true)
    expect('recorded' in tenantResult).toBe(true)
    const closed = await assembly.closeAfterBusiness(async () => ({ complete: true }))
    expect(closed.complete).toBe(true)

    const localRows = await assembly.local.query({ scope: local, limit: 4, maxBytes: 2048 })
    const tenantRows = await assembly.tenant.query({ scope: tenant, limit: 4, maxBytes: 2048 })
    expect('page' in localRows && localRows.page.records.map(row => row.scope.kind)).toEqual([
      'local',
    ])
    expect('page' in tenantRows && tenantRows.page.records.map(row => row.scope.kind)).toEqual([
      'tenant',
    ])
    expect(await assembly.tenant.query({ scope: otherTenant, limit: 4, maxBytes: 2048 })).toEqual({
      rejected: 'forbidden',
    })
    expect(await assembly.local.query({ scope: tenant, limit: 4, maxBytes: 2048 })).toEqual({
      rejected: 'forbidden',
    })
    const exported = await assembly.tenant.exportPage(
      { scope: tenant, limit: 4, maxBytes: 2048 },
      { maxRecords: 4, maxBytes: 2048 },
    )
    expect('page' in exported && exported.page.jsonl.includes('transport_retention_full')).toBe(
      true,
    )
    expect('page' in exported && exported.page.jsonl.includes('close_incomplete')).toBe(false)
  })

  it('retains current, old live and construction reservations in one limit', async () => {
    const transport = createDemoTransportRetention(2, () => new Date('2026-09-28T20:30:00Z'))
    const first = fakeTransport(1)
    const second = fakeTransport()
    const initial = transport.reserveReplacement()
    if (!('reservation' in initial)) throw new Error('initial reservation missing')
    const firstId = initial.reservation.commit(first.service)
    const replacement = transport.reserveReplacement()
    if (!('reservation' in replacement)) throw new Error('replacement reservation missing')
    expect(transport.health().transportReservedInstances).toBe(1)
    expect(transport.reserveReplacement()).toEqual({ unavailable: 'transport_retention_full' })
    const secondId = replacement.reservation.commit(second.service)
    expect(transport.health().transportLiveInstances).toBe(2)
    expect(transport.health().live.find(item => item.generation === firstId)?.role).toBe('retired')
    expect(transport.reserveReplacement()).toEqual({ unavailable: 'transport_retention_full' })

    // A resolved closed promise alone cannot release the old generation.
    first.resolveClosed()
    await Promise.resolve()
    expect(transport.health().transportLiveInstances).toBe(2)
    expect(await transport.closeRetired(firstId, policy())).toEqual({ retired: true })
    expect(first.closeCalls()).toBe(1)
    expect(transport.health().transportLiveInstances).toBe(2)
    first.setPending(0)
    expect(transport.health().transportLiveInstances).toBe(1)
    expect(transport.health().transportTerminalSnapshots).toBe(1)

    const third = transport.reserveReplacement()
    if (!('reservation' in third)) throw new Error('third reservation missing')
    expect(transport.health().transportSnapshotsEvicted).toBe(1)
    expect(transport.health().transportReservedInstances).toBe(1)
    third.reservation.abortNoResources()
    transport.markRetired(secondId)
    expect(await transport.closeRetired(secondId, policy())).toEqual({ retired: true })
    expect(transport.health().transportTerminalSnapshots).toBe(1)
  })

  it('fixes unique generations at reservation even when commits arrive out of order or construction aborts', () => {
    const transport = createDemoTransportRetention(4, () => new Date('2026-09-28T20:30:00Z'))
    const first = transport.reserveReplacement()
    const second = transport.reserveReplacement()
    if (!('reservation' in first) || !('reservation' in second))
      throw new Error('two reservations required')
    expect(first.reservation.generation).toBe(1)
    expect(second.reservation.generation).toBe(2)
    expect(second.reservation.commit(fakeTransport().service)).toBe(2)
    expect(first.reservation.commit(fakeTransport().service)).toBe(1)

    const aborted = transport.reserveReplacement()
    if (!('reservation' in aborted)) throw new Error('abort reservation required')
    expect(aborted.reservation.generation).toBe(3)
    aborted.reservation.abortNoResources()
    const failed = transport.reserveReplacement()
    if (!('reservation' in failed)) throw new Error('failed-construction reservation required')
    expect(failed.reservation.generation).toBe(4)
    expect(failed.reservation.adoptFailedConstruction(fakeTransport().service)).toBe(4)
    expect(
      transport
        .health()
        .live.map(entry => entry.generation)
        .sort(),
    ).toEqual([1, 2, 4])
    expect(transport.health().unknownReservations).toBe(0)
  })

  it('converts a real registry service only after its own close confirms resource release', async () => {
    const tracker = createDemoTransportRetention(1, () => new Date('2026-09-28T20:30:00Z'))
    const service = createModelTransportService({
      policy: {
        maxConnections: 1,
        idleConnectionTimeoutMs: 1000,
        connectTimeoutMs: 1000,
        maxErrorBodyBytes: 1024,
        maxSseEventBytes: 1024,
        credentialRedaction: openRouterCredentialRedactionConfig,
      },
    })
    const reserved = tracker.reserveReplacement()
    if (!('reservation' in reserved)) throw new Error('reservation missing')
    const id = reserved.reservation.commit(service)
    tracker.markRetired(id)
    expect(tracker.health().transportLiveInstances).toBe(1)
    expect(await tracker.closeRetired(id, policy())).toEqual({ retired: true })
    expect(tracker.health().transportLiveInstances).toBe(0)
    expect(tracker.health().transportTerminalSnapshots).toBe(1)
    expect(tracker.health().terminal[0]?.diagnostics.pending).toBe(0)
  })

  it('retains a real registry lease when retirement times out, then releases after the lease ends', async () => {
    const tracker = createDemoTransportRetention(1, () => new Date('2026-09-28T20:30:00Z'))
    const service = createModelTransportService({
      policy: {
        maxConnections: 1,
        idleConnectionTimeoutMs: 1000,
        connectTimeoutMs: 1000,
        maxErrorBodyBytes: 1024,
        maxSseEventBytes: 1024,
        credentialRedaction: openRouterCredentialRedactionConfig,
      },
    })
    const declaration = createOfficialProfileContent(deepseekV41FlashDefinition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: deepseekV41FlashConfiguration,
    })
    if ('rejected' in declaration) throw new Error('official profile unavailable')
    const registration = service.registerAdaptation(
      deepseekV41FlashDefinition,
      createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition),
      {},
      () => {},
    )
    if ('rejected' in registration) throw new Error('real registry registration failed')
    const acquired = service.acquire(declaration.ok.adaptation, deepseekV41FlashDefinition.modelId)
    if ('rejected' in acquired) throw new Error('real registry acquire failed')
    const reserved = tracker.reserveReplacement()
    if (!('reservation' in reserved)) throw new Error('reservation unavailable')
    const id = reserved.reservation.commit(service)
    tracker.markRetired(id)
    const result = await tracker.closeRetired(id, { ...policy(), waitMilliseconds: 10 })
    expect(result).toMatchObject({ remaining_active: true })
    expect(tracker.health().transportLiveInstances).toBe(1)
    expect(tracker.reserveReplacement()).toEqual({ unavailable: 'transport_retention_full' })
    acquired.lease.release()
    expect(await tracker.closeRetired(id, policy())).toEqual({ retired: true })
    expect(tracker.health().transportLiveInstances).toBe(0)
    expect(tracker.health().transportTerminalSnapshots).toBe(1)
  })

  it('keeps a partial-construction owner and business-incomplete writer visible', async () => {
    const assembly = await openDemoDiagnosticAssembly(config())
    const reservation = assembly.transports.reserveReplacement()
    if (!('reservation' in reservation)) throw new Error('reservation missing')
    reservation.reservation.abortUnknown()
    expect(assembly.transports.health().unknownReservations).toBe(1)
    const partial = fakeTransport(1)
    const partialId = reservation.reservation.adoptFailedConstruction(partial.service)
    expect(assembly.transports.health().unknownReservations).toBe(0)
    expect(await assembly.closeAfterBusiness(async () => ({ complete: false }))).toMatchObject({
      complete: false,
      businessComplete: false,
    })
    expect(assembly.local.health().writeState).toBe('open')
    expect(await assembly.closeAfterBusiness(async () => ({ complete: true }))).toMatchObject({
      complete: false,
      businessComplete: true,
    })
    expect(assembly.tenant.health().writeState).toBe('open')
    expect(
      assembly.transports.health().live.find(item => item.generation === partialId),
    ).toBeDefined()
    partial.setPending(0)
    expect(await assembly.closeAfterBusiness(async () => ({ complete: true }))).toMatchObject({
      complete: true,
      businessComplete: true,
    })
  })

  it('does not report complete while a diagnostic sink has not actually stopped', async () => {
    let release = () => {}
    let entered = () => {}
    const enteredSink = new Promise<void>(resolve => {
      entered = resolve
    })
    const pending = new Promise<void>(resolve => {
      release = resolve
    })
    const base = config()
    const assembly = await openDemoDiagnosticAssembly({
      ...base,
      collector: {
        ...base.collector,
        sink: {
          mode: 'async',
          maxPending: 1,
          maxQueuedRecords: 1,
          maxQueuedBytes: 1024,
          record() {
            entered()
            return pending
          },
        },
      },
    })
    assembly.local.collector.record(
      {
        source: 'assembly',
        stage: 'assembly',
        outcome: 'started',
        facts: { kind: 'diagnostics', reason: 'close_incomplete' },
      },
      local,
    )
    await enteredSink
    expect(assembly.local.health().pendingSinks).toBe(1)
    expect(await assembly.closeAfterBusiness(async () => ({ complete: true }))).toMatchObject({
      complete: false,
      businessComplete: true,
    })
    expect(assembly.local.health().pendingSinks).toBe(1)
    release()
    expect(await assembly.closeAfterBusiness(async () => ({ complete: true }))).toMatchObject({
      complete: true,
      businessComplete: true,
    })
  })

  it('fails startup on a symlinked diagnostic root before exposing a usable assembly', async () => {
    const base = config()
    await fs.mkdir(join(directory, 'indirect-target'), { mode: 0o700 })
    await fs.symlink(join(directory, 'indirect-target'), base.local.rootDir)
    await expect(openDemoDiagnosticAssembly(base)).rejects.toThrow()
    expect(await fs.readdir(join(directory, 'indirect-target'))).toEqual([])
  })
})
