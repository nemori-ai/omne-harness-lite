import type {
  CommandFacility,
  EnvironmentFacilities,
  EnvironmentLease,
  EnvironmentProvider,
  FileSystemFacility,
  ProviderAcquireInput,
  ProviderAcquisition,
  TerminalFacility,
} from '@omne-harness/execution-environment-contract'

export type NegativeFacilities = Readonly<{ retention?: true; entryName?: true }>

export type NegativeFixtureCounters = Readonly<{
  terminalCreates: number
  terminalExecutes: number
  commandStarts: number
}>

export type NegativeFixtureControl = Readonly<{
  activate(negative: NegativeFacilities | null): void
  counters(): NegativeFixtureCounters
}>

export function createNegativeFixtureProvider(
  inner: EnvironmentProvider,
): Readonly<{ provider: EnvironmentProvider; control: NegativeFixtureControl }> {
  let negative: NegativeFacilities | null = null
  let terminalCreates = 0
  let terminalExecutes = 0
  let commandStarts = 0

  const narrow = (lease: EnvironmentLease, mode: NegativeFacilities): EnvironmentLease =>
    Object.freeze<EnvironmentLease>({
      placement: lease.placement,
      instance: lease.instance,
      continuity: lease.continuity,
      invalidated: lease.invalidated,
      facility: key => {
        const original = lease.facility(key)
        if (original === undefined) return undefined
        if (key === 'terminal') {
          const terminal = original as TerminalFacility<unknown>
          return (
            mode.retention === true
              ? withoutRetention(
                  terminal,
                  () => {
                    terminalCreates++
                  },
                  () => {
                    terminalExecutes++
                  },
                )
              : countingTerminal(
                  terminal,
                  () => {
                    terminalCreates++
                  },
                  () => {
                    terminalExecutes++
                  },
                )
          ) as EnvironmentFacilities[typeof key]
        }
        if (key === 'files' && mode.entryName === true)
          return withoutEntryNames(
            original as FileSystemFacility<unknown>,
          ) as EnvironmentFacilities[typeof key]
        if (key === 'command')
          return countingStarts(original as CommandFacility<unknown>, () => {
            commandStarts++
          }) as EnvironmentFacilities[typeof key]
        return original
      },
      release: () => lease.release(),
    })

  const provider: EnvironmentProvider = {
    name: inner.name,
    generation: inner.generation,
    version: inner.version,
    quotaDomain: inner.quotaDomain,
    bindingKinds: inner.bindingKinds,
    continuity: inner.continuity,
    facilities: inner.facilities,
    isolation: inner.isolation,
    describe: () => inner.describe(),
    quota: tenant => inner.quota(tenant),
    acquire: async (input: ProviderAcquireInput): Promise<ProviderAcquisition> => {
      const mode = negative
      const answer = await inner.acquire(input)
      if (answer.kind !== 'acquired') return answer
      return Object.freeze({ ...answer, lease: narrow(answer.lease, mode ?? {}) })
    },
    inspectAcquisition: original => inner.inspectAcquisition(original),
    listAcquisitions: scope => inner.listAcquisitions(scope),
    settleAcquisition: original => inner.settleAcquisition(original),
    retire: () => inner.retire(),
    ...(inner.listRecoveryResources === undefined
      ? {}
      : {
          listRecoveryResources: (scope: Parameters<EnvironmentProvider['listAcquisitions']>[0]) =>
            inner.listRecoveryResources!(scope),
        }),
    ...(inner.recover === undefined
      ? {}
      : {
          recover: (resource: Parameters<NonNullable<EnvironmentProvider['recover']>>[0]) =>
            inner.recover!(resource),
        }),
  }

  return {
    provider,
    control: {
      activate(next) {
        negative = next
      },
      counters: () => ({ terminalCreates, terminalExecutes, commandStarts }),
    },
  }
}

type Counter = () => void

function withoutRetention(
  original: TerminalFacility<unknown>,
  created: Counter,
  executed: Counter,
): TerminalFacility<unknown> {
  return {
    create: async request => {
      created()
      return original.create(request)
    },
    execute: async request => {
      executed()
      return original.execute(request)
    },
    close: request => original.close(request),
    list: request => original.list(request),
  }
}

function countingTerminal(
  original: TerminalFacility<unknown>,
  created: Counter,
  executed: Counter,
): TerminalFacility<unknown> {
  return {
    ...(original.retention === undefined ? {} : { retention: original.retention }),
    create: async request => {
      created()
      return original.create(request)
    },
    execute: async request => {
      executed()
      return original.execute(request)
    },
    close: request => original.close(request),
    list: request => original.list(request),
  }
}

function countingStarts(
  original: CommandFacility<unknown>,
  started: Counter,
): CommandFacility<unknown> {
  return {
    start: async request => {
      started()
      return original.start(request)
    },
  }
}

function withoutEntryNames(original: FileSystemFacility<unknown>): FileSystemFacility<unknown> {
  return {
    ...original,
    list: async request => {
      const listed = await original.list(request)
      if (listed.kind !== 'done') return listed
      return {
        ...listed,
        value: {
          directory: listed.value.directory,
          entries: listed.value.entries.map(entry => {
            const { name: _omitted, ...rest } = entry
            return rest
          }),
          ...(listed.value.nextOffset === undefined ? {} : { nextOffset: listed.value.nextOffset }),
        },
      }
    },
  }
}
