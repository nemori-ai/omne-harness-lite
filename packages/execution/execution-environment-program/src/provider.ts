import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { release } from 'node:os'
import { loadQuickJSWasm, type CodemodeWasmModule } from '@earendil-works/pi-codemode'
import type {
  EnvironmentFacilities,
  EnvironmentLease,
  EnvironmentProvider,
  FacilityKey,
  IsolationClaim,
  LeaseInvalidation,
  OriginalAcquisition,
  ProgramFacility,
  ProgramLimits,
  ProgramRun,
  ProviderAcquireInput,
  ProviderAcquisition,
} from '@omne-harness/execution-environment-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { startProgram, type ProgramEngine } from './run.ts'

export type ProgramProviderOptions = Readonly<{
  /** The most a caller may ask for. A request above any of them is refused, never lowered. */
  ceilings?: Partial<ProgramLimits>
  /** Execution domains that may exist at the same time; a run beyond it is refused with `capacity`. */
  maxDomains?: number
  quotaDomain?: string
  wasm?: () => Promise<CodemodeWasmModule>
  workerUrl?: string | URL
}>

export const programProviderName = 'program-sandbox'
export const defaultProgramCeilings: ProgramLimits = Object.freeze({
  computeMs: 120_000,
  memoryBytes: 256 * 1024 * 1024,
  outputBytes: 8 * 1024 * 1024,
  calls: 10_000,
})
const defaultMaxDomains = 8

type Held = {
  readonly original: OriginalAcquisition
  readonly fingerprint: string
  readonly runs: Set<ProgramRun>
  lease: EnvironmentLease | null
  state: 'open' | 'settled'
  invalidate(value: LeaseInvalidation): void
}

function packageVersion(): string {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  const version = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : 0
  if (typeof version !== 'string')
    throw new Error('execution-environment-program: package.json has no version')
  return version
}

function chain(scope: ScopeRef | undefined): readonly string[] {
  const refs: string[] = []
  for (let s = scope; s; s = s.parent) refs.push(s.ref)
  return refs
}

function keyOf(original: OriginalAcquisition): string | undefined {
  const tenant = tenantCodec.encode(original.tenant)
  return tenant.ok ? JSON.stringify([tenant.value, original.acquisition]) : undefined
}

function fingerprintOf(original: OriginalAcquisition): string {
  const p = original.placement
  return JSON.stringify([
    original.origin,
    chain(original.scope),
    p.quotaDomain,
    p.binding.kind,
    'scope' in p.binding ? chain(p.binding.scope) : null,
    p.provider,
    [...new Set(p.requirement.facilities)].sort(),
    [...new Set(p.requirement.isolation)].sort(),
  ])
}

async function drain(held: Held): Promise<void> {
  held.state = 'settled'
  for (const run of held.runs) run.abort()
  await Promise.all([...held.runs].map(run => run.outcome))
}

/** The lease of one acquisition: `program` and nothing else, closed once the acquisition is settled. */
function leaseOf(held: Held, engine: ProgramEngine, generation: string, retired: () => boolean) {
  const closed = () => retired() || held.state !== 'open'
  const program: ProgramFacility<unknown> = {
    async run(request) {
      if (closed()) return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
      const answer = await startProgram(request, engine)
      if (answer.kind !== 'done') return answer
      const run = answer.value
      held.runs.add(run)
      void run.outcome.then(() => held.runs.delete(run))
      if (closed()) run.abort()
      return answer
    },
  }
  const offered: Partial<EnvironmentFacilities> = { program }
  const lease: EnvironmentLease = {
    placement: held.original.placement,
    instance: { id: programProviderName, generation },
    continuity: { kind: 'not_guaranteed' },
    invalidated: new Promise<LeaseInvalidation>(resolve => {
      held.invalidate = resolve
    }),
    facility<F extends FacilityKey>(key: F) {
      return offered[key]
    },
    async release() {
      await drain(held)
      return { kind: 'released' }
    },
  }
  return lease
}

function acquisitionBook(lease: (held: Held) => EnvironmentLease, evidence: JsonValue) {
  const records = new Map<string, Held>()
  const lookup = (original: OriginalAcquisition): Held | 'conflict' | undefined => {
    const key = keyOf(original)
    const held = key === undefined ? undefined : records.get(key)
    if (held === undefined) return undefined
    return held.fingerprint === fingerprintOf(original) ? held : 'conflict'
  }
  const admit = (input: ProviderAcquireInput): ProviderAcquisition => {
    const original: OriginalAcquisition = {
      tenant: input.tenant,
      acquisition: input.acquisition,
      origin: input.origin,
      scope: input.scope,
      placement: input.placement,
    }
    const key = keyOf(original)
    if (key === undefined) return { kind: 'rejected', reason: 'invalidInput' }
    const known = lookup(original)
    if (known === 'conflict') return { kind: 'rejected', reason: 'acquisitionConflict' }
    if (known !== undefined)
      return known.state === 'open' && known.lease !== null
        ? { kind: 'acquired', lease: known.lease, evidence }
        : { kind: 'unknown', acquisition: input.acquisition }
    const held: Held = {
      original,
      fingerprint: fingerprintOf(original),
      runs: new Set(),
      lease: null,
      state: 'open',
      invalidate: () => undefined,
    }
    held.lease = lease(held)
    records.set(key, held)
    return { kind: 'acquired', lease: held.lease, evidence }
  }
  const open = () => [...records.values()].filter(held => held.state === 'open')
  return { lookup, admit, open }
}

export function createProgramProvider(options: ProgramProviderOptions = {}): EnvironmentProvider {
  const version = packageVersion()
  const generation = randomUUID()
  const facilities: readonly FacilityKey[] = Object.freeze(['program'])
  const isolation: readonly IsolationClaim[] = Object.freeze(['restricted-js', 'network-none'])
  const engine: ProgramEngine = {
    wasm: options.wasm ?? (() => loadQuickJSWasm()),
    ...(options.workerUrl === undefined ? {} : { workerUrl: options.workerUrl }),
    ceilings: Object.freeze({ ...defaultProgramCeilings, ...options.ceilings }),
    domains: { active: 0, max: options.maxDomains ?? defaultMaxDomains },
  }
  if (!Number.isSafeInteger(engine.domains.max) || engine.domains.max < 1)
    throw new RangeError('maxDomains must be a whole number, one or more')
  const evidence: JsonValue = {
    kind: 'object',
    entries: [
      { key: 'provider', value: { kind: 'string', value: programProviderName } },
      { key: 'generation', value: { kind: 'string', value: generation } },
    ],
  }
  let retired = false
  const book = acquisitionBook(held => leaseOf(held, engine, generation, () => retired), evidence)

  const provider: EnvironmentProvider = {
    name: programProviderName,
    generation,
    version,
    quotaDomain: options.quotaDomain ?? programProviderName,
    bindingKinds: Object.freeze(['stateless_sandbox'] as const),
    continuity: Object.freeze({ kind: 'not_guaranteed' }),
    facilities,
    isolation,
    async describe() {
      const prerequisites = await engine.wasm().then(
        () => 'satisfied' as const,
        () => 'unsatisfied' as const,
      )
      const platform = { os: process.platform, release: release() }
      const identity = { provider: programProviderName, generation, version, platform }
      return Object.freeze({ ...identity, facilities, isolation, prerequisites })
    },
    async quota() {
      const quota = { unit: 'unsettled-acquisition', perTenant: Number.MAX_SAFE_INTEGER } as const
      return { kind: 'declared', quota: { ...quota, global: null } }
    },
    async acquire(input) {
      if (retired) return { kind: 'rejected', reason: 'providerUnavailable' }
      if (input.placement.binding.kind !== 'stateless_sandbox')
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      return book.admit(input)
    },
    async inspectAcquisition(original) {
      const held = book.lookup(original)
      if (held === undefined) return { kind: 'notAllocated' }
      if (held === 'conflict') return { kind: 'conflict' }
      return held.state === 'open' && held.lease !== null
        ? { kind: 'acquired', lease: held.lease, evidence }
        : { kind: 'settled' }
    },
    async listAcquisitions(scope) {
      const here = book.open().filter(held => held.original.scope.ref === scope.ref)
      return { kind: 'listed', acquisitions: here.map(held => held.original) }
    },
    async settleAcquisition(original) {
      const held = book.lookup(original)
      if (held === undefined) return { kind: 'notAllocated' }
      if (held === 'conflict') return { kind: 'conflict' }
      await drain(held)
      return { kind: 'settled' }
    },
    async retire() {
      retired = true
      const open = book.open()
      for (const held of open) held.invalidate({ source: 'provider', reason: 'providerRetired' })
      await Promise.all(open.map(drain))
      return { kind: 'drained' }
    },
  }
  return Object.freeze(provider)
}
