import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { release } from 'node:os'
import type {
  BindingKind,
  EnvironmentContinuity,
  EnvironmentFacilities,
  EnvironmentLease,
  EnvironmentProvider,
  FacilityKey,
  FacilityResult,
  FileSystemFacility,
  LeaseInvalidation,
  ProviderFacts,
  Retirement,
} from '@omne-harness/execution-environment-contract'
import { createHostFiles } from './host-files.ts'

/** Initial value of `drainBoundMs` when the configuration does not give one. */
const defaultDrainBoundMs = 10_000

/** One structured diagnostic of the host files provider. */
export type HostFilesDiagnostic = Readonly<{
  kind: 'drainBoundExceeded'
  provider: string
  generation: string
  /** File operations still running when the bound passed. */
  inFlight: number
  boundMs: number
}>

export type HostFilesProviderOptions = Readonly<{
  /** Upper bound in milliseconds that `retire()` waits for in-flight file operations. */
  drainBoundMs?: number
  /** Receives a diagnostic when a retirement passes its bound. */
  diagnose?: (diagnostic: HostFilesDiagnostic) => void
}>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/** The version of this package, read from its `package.json` beside `src/` and `dist/`. */
function packageVersion(): string {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  if (!isRecord(parsed) || typeof parsed['version'] !== 'string')
    throw new Error('execution-environment-host-local: package.json has no version')
  return parsed['version']
}

const version = packageVersion()

function isDrainBound(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function retiredResult(requestId: string): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason: 'closed' }
}

/**
 * Counts the file operations in flight. Once `stop()` is called it admits no new operation: a new
 * operation answers `closed` without touching the file system. `settled()` resolves when every
 * operation admitted before `stop()` has ended.
 */
function trackedFiles(files: FileSystemFacility<unknown>) {
  const inFlight = new Set<Promise<unknown>>()
  let stopped = false

  const track =
    <Q extends { readonly requestId: string }, T>(
      run: (request: Q) => Promise<FacilityResult<T>>,
    ) =>
    async (request: Q): Promise<FacilityResult<T>> => {
      if (stopped) return retiredResult(request.requestId)
      const running = run(request)
      inFlight.add(running)
      try {
        return await running
      } finally {
        inFlight.delete(running)
      }
    }

  const facility: FileSystemFacility<unknown> = {
    read: track(request => files.read(request)),
    stat: track(request => files.stat(request)),
    write: track(request => files.write(request)),
    close: track(request => files.close(request)),
    list: track(request => files.list(request)),
    search: track(request => files.search(request)),
    mkdir: track(request => files.mkdir(request)),
    remove: track(request => files.remove(request)),
    move: track(request => files.move(request)),
    copy: track(request => files.copy(request)),
    commitBatch: track(request => files.commitBatch(request)),
    recoverBatch: track(request => files.recoverBatch(request)),
  }

  return {
    facility,
    stop() {
      stopped = true
    },
    count: () => inFlight.size,
    settled: () => Promise.allSettled(inFlight).then(() => undefined),
  }
}

/** Waits for `settled` at most `boundMs`; answers whether it settled in time. */
async function within(settled: Promise<void>, boundMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<false>(resolve => {
    timer = setTimeout(resolve, boundMs, false)
  })
  try {
    return await Promise.race([settled.then(() => true), expired])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The host provider of the `files` facility. It serves the `host_machine` layer only, confirms no
 * isolation claim, gives no continuity guarantee and does not support recovery: its file operations
 * leave no managed resource behind. Its `acquire` allocates no external resource. Its `retire`
 * admits no new file operation, then waits for the operations in flight up to `drainBoundMs`.
 */
export function createHostFilesProvider(
  options: HostFilesProviderOptions = {},
): EnvironmentProvider {
  const drainBoundMs = options.drainBoundMs ?? defaultDrainBoundMs
  if (!isDrainBound(drainBoundMs))
    throw new RangeError('drainBoundMs must be a finite number of milliseconds, zero or more')
  const name = 'host-files'
  const generation = randomUUID()
  const files = trackedFiles(createHostFiles())
  const facilities: readonly FacilityKey[] = ['files']
  // One resolver per live lease; a release removes its own, a retirement settles the rest.
  const invalidations = new Set<(value: LeaseInvalidation) => void>()
  let retired = false

  // The platform prerequisites are not probed yet, so they are unknown, not satisfied.
  const facts: ProviderFacts = Object.freeze({
    provider: name,
    generation,
    version,
    platform: Object.freeze({ os: process.platform, release: release() }),
    facilities,
    isolation: [],
    prerequisites: 'unknown',
  })

  const bindingKinds: readonly BindingKind[] = Object.freeze(['host_machine'])
  const continuity: EnvironmentContinuity = Object.freeze({ kind: 'not_guaranteed' })
  const available: Partial<EnvironmentFacilities> = { files: files.facility }

  const drain = async (): Promise<Retirement> => {
    if (await within(files.settled(), drainBoundMs)) return { kind: 'drained' }
    options.diagnose?.(
      Object.freeze({
        kind: 'drainBoundExceeded',
        provider: name,
        generation,
        inFlight: files.count(),
        boundMs: drainBoundMs,
      }),
    )
    return { kind: 'pending', resources: [] }
  }

  const provider: EnvironmentProvider = {
    name,
    generation,
    version,
    bindingKinds,
    continuity,
    facilities,
    isolation: [],
    async describe() {
      return facts
    },
    async acquire(input) {
      if (retired) return { kind: 'rejected', reason: 'providerUnavailable' }
      if (input.placement.binding.kind !== 'host_machine')
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      let settle: (value: LeaseInvalidation) => void = () => undefined
      const invalidated = new Promise<LeaseInvalidation>(resolve => {
        settle = resolve
      })
      invalidations.add(settle)
      const lease: EnvironmentLease = {
        placement: input.placement,
        instance: { id: 'host', generation },
        continuity,
        invalidated,
        facility<F extends FacilityKey>(key: F) {
          return available[key]
        },
        async release() {
          invalidations.delete(settle)
          return { kind: 'released' }
        },
      }
      return {
        kind: 'acquired',
        lease,
        evidence: {
          kind: 'object',
          entries: [
            { key: 'provider', value: { kind: 'string', value: name } },
            { key: 'generation', value: { kind: 'string', value: generation } },
            { key: 'version', value: { kind: 'string', value: version } },
          ],
        },
      }
    },
    async retire() {
      retired = true
      files.stop()
      for (const invalidate of invalidations)
        invalidate({ source: 'provider', reason: 'providerRetired' })
      invalidations.clear()
      return drain()
    },
  }
  return Object.freeze(provider)
}
