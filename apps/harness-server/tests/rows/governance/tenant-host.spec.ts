// The tenant governance host over scripted assemblies: what a failed open leaves behind. One
// prepared assembly owns one attempt (tenant-runtime.ts), so a later attempt is a new assembly;
// a tenant whose first open failed must not stay without governance for the life of the process.
import { expect, it, vi } from 'vitest'
import { TenantGovernanceHost } from '../../../src/rows/governance/tenant-host.ts'
import { monotonicClock } from '../../../src/shutdown.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const DOMAIN = { name: 'tenant/one', scope: { kind: 'tenant', tenant: TENANT } }

type HostOptions = ConstructorParameters<typeof TenantGovernanceHost>[0]
type Assembly = ReturnType<HostOptions['prepare']>
type Opened = Awaited<ReturnType<Assembly['open']>>

const created = (close = vi.fn(async () => ({ kind: 'closed' as const }))) =>
  ({ kind: 'created', close, permissionBasis: undefined }) as unknown as Opened
const failedInstallation = (close = vi.fn(async () => ({ kind: 'closed' as const }))) =>
  ({
    kind: 'unavailable',
    owner: 'harness.tenant-governance',
    phase: 'installation',
    close,
  }) as unknown as Opened
const failedStartup = () =>
  ({
    kind: 'unavailable',
    owner: 'harness.tenant-governance',
    phase: 'startup',
  }) as unknown as Opened

/** A host whose n-th prepared assembly opens with the n-th scripted result. */
function hostOver(results: readonly Opened[], extra: Partial<HostOptions> = {}) {
  const opens = vi.fn()
  let prepared = 0
  const host = new TenantGovernanceHost({
    domains: {
      lookup: async () => ({ kind: 'ready', domain: DOMAIN }),
    } as unknown as HostOptions['domains'],
    prepare() {
      const result = results[Math.min(prepared, results.length - 1)]
      prepared += 1
      return {
        destination: { seal: async () => ({ kind: 'unavailable' }) },
        open: async () => {
          opens()
          return result
        },
      } as unknown as Assembly
    },
    retryPauseMs: () => 0,
    ...extra,
  })
  return { host, opens, prepared: () => prepared }
}

it('opens the tenant again with a new assembly after an open that failed', async () => {
  const { host, opens, prepared } = hostOver([failedStartup(), created()])
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(opens).toHaveBeenCalledTimes(2)
  expect(prepared()).toBe(2)
  // The open one is kept: no third attempt.
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(opens).toHaveBeenCalledTimes(2)
})

it('closes what a failed installation still holds before the next attempt', async () => {
  const close = vi.fn(async () => ({ kind: 'closed' as const }))
  const { host } = hostOver([failedInstallation(close), created()])
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(close).not.toHaveBeenCalled()
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(close).toHaveBeenCalledTimes(1)
})

it('answers unavailable without another attempt until the pause after a failure is over', async () => {
  let now = 1000
  const { host, opens } = hostOver([failedStartup(), created()], {
    retryPauseMs: failures => (failures === 1 ? 5000 : 0),
    now: () => now,
  })
  expect(await host.runtime(TENANT)).toBeUndefined()
  now += 4999
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(opens).toHaveBeenCalledTimes(1)
  now += 1
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(opens).toHaveBeenCalledTimes(2)
})

it('lengthens the pause with every failure in a row and reports each one', async () => {
  let now = 0
  const pauses: number[] = []
  const reports: string[] = []
  const { host } = hostOver([failedStartup(), failedStartup(), failedStartup(), created()], {
    retryPauseMs: failures => {
      pauses.push(failures)
      return 10
    },
    now: () => now,
    report: failure => reports.push(`${failure.phase}/${failure.failures}`),
  })
  for (let round = 0; round < 3; round += 1) {
    expect(await host.runtime(TENANT)).toBeUndefined()
    now += 10
  }
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(pauses).toEqual([1, 2, 3])
  expect(reports).toEqual(['startup/1', 'startup/2', 'startup/3'])
})

it('shares one attempt between callers that arrive while it is in flight', async () => {
  const { host, opens } = hostOver([created()])
  const [first, second] = await Promise.all([host.runtime(TENANT), host.runtime(TENANT)])
  expect(first).toBe(second)
  expect(opens).toHaveBeenCalledTimes(1)
})

it('closes the open runtime and what a failed installation holds when the host closes', async () => {
  const closeOpen = vi.fn(async () => ({ kind: 'closed' as const }))
  const open = hostOver([created(closeOpen)])
  await open.host.runtime(TENANT)
  expect(await open.host.close(monotonicClock.now() + 1000)).toEqual({ kind: 'settled' })
  expect(closeOpen).toHaveBeenCalledTimes(1)

  const closeFailed = vi.fn(async () => ({ kind: 'closed' as const }))
  const failed = hostOver([failedInstallation(closeFailed)])
  await failed.host.runtime(TENANT)
  expect(await failed.host.close(monotonicClock.now() + 1000)).toEqual({ kind: 'settled' })
  expect(closeFailed).toHaveBeenCalledTimes(1)
  expect(await failed.host.runtime(TENANT)).toBeUndefined()
})
