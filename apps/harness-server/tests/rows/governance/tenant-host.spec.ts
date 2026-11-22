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
    reason: 'tool installation adopt',
    close,
  }) as unknown as Opened
const failedStartup = () =>
  ({
    kind: 'unavailable',
    owner: 'harness.tenant-governance',
    phase: 'startup',
    reason: 'governance-startup unavailable',
  }) as unknown as Opened

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
    report: failure => reports.push(`${failure.phase}/${failure.reason}/${failure.failures}`),
  })
  for (let round = 0; round < 3; round += 1) {
    expect(await host.runtime(TENANT)).toBeUndefined()
    now += 10
  }
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(pauses).toEqual([1, 2, 3])
  expect(reports).toEqual([
    'startup/governance-startup unavailable/1',
    'startup/governance-startup unavailable/2',
    'startup/governance-startup unavailable/3',
  ])
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

function lookupOf(...answers: readonly object[]) {
  const lookup = vi.fn(
    async () => answers[Math.min(lookup.mock.calls.length - 1, answers.length - 1)],
  )
  return lookup as unknown as HostOptions['domains']['lookup'] & typeof lookup
}
const READY = { kind: 'ready', domain: DOMAIN }

it('answers undefined without a report or a pause for a tenant that was never registered', async () => {
  const lookup = lookupOf({ kind: 'unregistered' }, READY)
  const report = vi.fn()
  const { host } = hostOver([created()], {
    domains: { lookup },
    report,
    retryPauseMs: () => 60_000,
    now: () => 0,
  })
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(report).not.toHaveBeenCalled()
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(lookup).toHaveBeenCalledTimes(2)
})

it('reports a lookup that cannot be read and prepares again after the pause', async () => {
  let now = 0
  const lookup = lookupOf({ kind: 'unavailable', diagnostic: 'directory down' }, READY)
  const reports: object[] = []
  const { host } = hostOver([created()], {
    domains: { lookup },
    report: failure => reports.push(failure),
    retryPauseMs: () => 500,
    now: () => now,
  })
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(reports).toEqual([
    { tenantRef: TENANT, phase: 'lookup', reason: 'directory down', failures: 1, againInMs: 500 },
  ])
  now += 500
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(lookup).toHaveBeenCalledTimes(2)
})

it('reports a prepare that throws and prepares again after the pause', async () => {
  let now = 0
  let calls = 0
  const reports: object[] = []
  const { host } = hostOver([created()], {
    prepare() {
      calls += 1
      if (calls === 1) throw new Error('governance principal unavailable')
      return { destination: {}, open: async () => created() } as unknown as Assembly
    },
    report: failure => reports.push(failure),
    retryPauseMs: () => 500,
    now: () => now,
  })
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(reports).toEqual([
    { tenantRef: TENANT, phase: 'prepare', reason: 'threw', failures: 1, againInMs: 500 },
  ])
  now += 500
  expect(await host.runtime(TENANT)).toMatchObject({ kind: 'created' })
  expect(calls).toBe(2)
})

it('does not ask the directory again while the pause after a failed lookup lasts', async () => {
  let now = 0
  const lookup = lookupOf({ kind: 'unavailable', diagnostic: 'directory down' }, READY)
  const { host } = hostOver([created()], {
    domains: { lookup },
    retryPauseMs: () => 500,
    now: () => now,
  })
  expect(await host.runtime(TENANT)).toBeUndefined()
  now += 499
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(await host.settings(TENANT)).toBeUndefined()
  expect(lookup).toHaveBeenCalledTimes(1)
})

function withSettings(opened: Opened) {
  const settings = { read: vi.fn(), writer: { write: vi.fn() } }
  return {
    settings,
    prepare: () =>
      ({
        destination: {},
        settings,
        open: async () => opened,
      }) as unknown as Assembly,
  }
}

it('registers the domain of an unregistered tenant before it opens the settings of the tenant', async () => {
  let registered = false
  const lookup = vi.fn(async () => (registered ? READY : { kind: 'unregistered' }))
  const ensure = vi.fn(async () => {
    registered = true
    return { kind: 'ready' as const }
  })
  const { settings, prepare } = withSettings(created())
  const { host } = hostOver([], {
    domains: { lookup } as unknown as HostOptions['domains'],
    registration: () => ({ ensure }),
    prepare,
  })
  expect(await host.runtime(TENANT)).toBeUndefined()
  expect(ensure).not.toHaveBeenCalled()
  expect(await host.settings(TENANT)).toBe(settings)
  expect(ensure).toHaveBeenCalledWith({ tenant: TENANT })
})

it.each([
  ['answers unavailable', async () => ({ kind: 'unavailable' as const, diagnostic: 'stopping' })],
  [
    'throws',
    async () => {
      throw new Error('registration transport failure')
    },
  ],
] as const)(
  'answers no settings and opens nothing when the registration %s',
  async (_name, ensure) => {
    const opens = vi.fn()
    const { host } = hostOver([created()], {
      domains: { lookup: async () => READY } as unknown as HostOptions['domains'],
      registration: () => ({ ensure }),
      prepare: () =>
        ({
          destination: {},
          open: async () => {
            opens()
            return created()
          },
        }) as unknown as Assembly,
    })
    expect(await host.settings(TENANT)).toBeUndefined()
    expect(opens).not.toHaveBeenCalled()
  },
)

it('opens a registered tenant as before when no registration is mounted', async () => {
  const { settings, prepare } = withSettings(created())
  const { host } = hostOver([], { registration: () => undefined, prepare })
  expect(await host.settings(TENANT)).toBe(settings)
})
