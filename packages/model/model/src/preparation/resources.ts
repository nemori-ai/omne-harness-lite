// The production `ModelPreparationResources`. A lease acquires one family binding per profile
// supplier, reads the facts of the calls the lineage names once with the access of the caller,
// and hands out meters. Without a lineage the meter answers what the family meter answers. With
// one, the meter judges the anchor and the sources synchronously, calls the family's
// `measureCalibrated`, and writes the verdict into the budget. After release every meter of the
// lease is unavailable. The view of the facts dies with the lease.
import type {
  Access,
  CalibratedInputMeter,
  CalibrationReport,
  ModelFailure,
  ModelInputMeter,
  ModelPreparationLease,
  ModelPreparationResources,
  ModelProfile,
  ModelRequestRules,
  ProfileSupplier,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { readCallFacts, type CallFactsReader, type CallFactsView } from './facts.ts'
import { judgeAnchor, judgeOutputs } from './judge.ts'
import { parseLineage, type Lineage } from './lineage.ts'

/** One supplier's rules and calibrated meter. A pi family binding satisfies it as it is. */
export type PreparationBinding = Readonly<{
  supplier: Supplier
  rules: ModelRequestRules
  meter: CalibratedInputMeter
  /** Rejects when the resources of the binding could not be released. */
  release(): Promise<void>
}>

/** Where the lease gets bindings. `PiFamilyContributions` satisfies it structurally. */
export interface PreparationBindingSource {
  acquire(
    supplier: Supplier,
    signal: AbortSignal,
  ): Promise<Outcome<PreparationBinding, TransportFailure>>
}

/**
 * The supplier of one profile supplier with its credential reference. The profile has no
 * credential; the host that owns credential scoping completes it, with the same derivation that
 * request preparation uses. The result must keep the adoption and the route of the input.
 */
export type SupplierPort<P> = (
  input: Access<P> & Readonly<{ profile: ModelProfile; supplier: ProfileSupplier }>,
) => Outcome<Supplier, ModelFailure>

export type ModelPreparationOptions<P> = Readonly<{
  /** Read through `dispatches` only, always with the access of the lease. */
  commands: CallFactsReader<P>
  bindings: PreparationBindingSource
  supplierOf: SupplierPort<P>
  /** The most distinct calls one lineage may name. From configuration; no package default. */
  maxCitedCalls: number
}>

type Released = Awaited<ReturnType<ModelPreparationLease['release']>>
type Binding = ModelPreparationLease['bindings'][number]

const LEASE = 'model-preparation'

function checkOptions<P>(options: ModelPreparationOptions<P>): void {
  if (typeof options !== 'object' || options === null)
    throw new RangeError('the preparation options must be an object')
  if (typeof options.commands?.dispatches !== 'function')
    throw new RangeError('options.commands must read dispatches')
  if (typeof options.bindings?.acquire !== 'function')
    throw new RangeError('options.bindings must acquire bindings')
  if (typeof options.supplierOf !== 'function')
    throw new RangeError('options.supplierOf must be a function')
  if (!Number.isSafeInteger(options.maxCitedCalls) || options.maxCitedCalls <= 0)
    throw new RangeError('options.maxCitedCalls must be a positive safe integer')
}

function sameRoute(supplier: Supplier, declared: ProfileSupplier): boolean {
  const left = supplier.adoption
  const right = declared.adoption
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest &&
    supplier.recipient === declared.recipient &&
    supplier.model === declared.model
  )
}

/** Releases every binding once; a rejected release becomes the `unavailable` of the contract. */
async function releaseAll(acquired: readonly PreparationBinding[]): Promise<Released> {
  const results = await Promise.allSettled(acquired.map(binding => binding.release()))
  const failed = results.findIndex(result => result.status === 'rejected')
  if (failed < 0) return {}
  return {
    failure: {
      kind: 'unavailable',
      dependency: acquired[failed]?.supplier.adoption.owner ?? LEASE,
      diagnostic: 'release-failed',
    },
  }
}

type Measured = ReturnType<ModelInputMeter['measure']>

/** What every meter of a released lease answers, with or without a lineage. */
function releasedAnswer(): Measured {
  return {
    failure: { kind: 'unavailable', dependency: LEASE, diagnostic: 'preparation-lease-released' },
  }
}

/**
 * The meter of one binding without a lineage: until release it answers exactly what the family
 * meter answers; after release it answers `preparation-lease-released`.
 */
function plainMeter(binding: PreparationBinding, isReleased: () => boolean): ModelInputMeter {
  const meter: ModelInputMeter = {
    basis: binding.meter.basis,
    measure: input => (isReleased() ? releasedAnswer() : binding.meter.measure(input)),
  }
  return Object.freeze(meter)
}

/** The meter of one binding under a lineage: synchronous, reads nothing, judges, delegates. */
function lineageMeter(
  binding: PreparationBinding,
  lineage: Lineage,
  facts: CallFactsView,
  isReleased: () => boolean,
): ModelInputMeter {
  const meter: ModelInputMeter = {
    basis: binding.meter.basis,
    measure(input) {
      if (isReleased()) return releasedAnswer()
      const supplier = binding.supplier.adoption
      const anchor = judgeAnchor({
        continues: lineage.continues,
        facts,
        supplier,
        representation: input.representation,
        messages: input.assembled.messages.map(message => message.id),
      })
      const outputs = judgeOutputs({
        sources: lineage.sources,
        facts,
        supplier,
        messages: input.assembled.messages,
      })
      const measured = binding.meter.measureCalibrated(input, {
        anchor:
          anchor.kind === 'hit' ? { covered: anchor.covered, inputTotal: anchor.inputTotal } : null,
        outputs,
      })
      if (!('ok' in measured)) return measured
      // The family reports `continuation-shrank` itself; every other miss is judged here.
      const verdict: CalibrationReport['anchor'] =
        anchor.kind === 'miss' ? anchor : (measured.ok.calibration?.anchor ?? { kind: 'hit' })
      return { ok: { ...measured.ok, calibration: { anchor: verdict } } }
    },
  }
  return Object.freeze(meter)
}

function leaseOf(
  acquired: readonly PreparationBinding[],
  lineage: Lineage | null,
  facts: CallFactsView,
): ModelPreparationLease {
  const [first, ...rest] = acquired
  if (first === undefined) throw new TypeError('a profile names at least one supplier')
  let released: Promise<Released> | undefined
  const isReleased = (): boolean => released !== undefined
  const bindingOf = (binding: PreparationBinding): Binding =>
    Object.freeze({
      supplier: binding.supplier,
      rules: binding.rules,
      meter:
        lineage === null
          ? plainMeter(binding, isReleased)
          : lineageMeter(binding, lineage, facts, isReleased),
    })
  const lease: ModelPreparationLease = {
    bindings: [bindingOf(first), ...rest.map(bindingOf)],
    release: () => {
      released ??= releaseAll(acquired)
      return released
    },
  }
  return Object.freeze(lease)
}

/**
 * Lease life: `acquire` creates the bindings (one per supplier, all or nothing) and the facts view
 * (every named call read once, here); `measure` reads nothing; `release` is idempotent and a later
 * `measure` of any meter of the lease is `unavailable` (`preparation-lease-released`). Nothing is kept
 * across leases. Throws `RangeError` for options no lease could use.
 */
export function createModelPreparationResources<P>(
  options: ModelPreparationOptions<P>,
): ModelPreparationResources<P> {
  checkOptions(options)
  const resources: ModelPreparationResources<P> = {
    async acquire(input) {
      const lineage = parseLineage(input.lineage, options.maxCitedCalls)
      if (!('ok' in lineage)) return lineage
      const access: Access<P> = { principal: input.principal, tenant: input.tenant }
      const acquired: PreparationBinding[] = []
      const signal = new AbortController().signal
      for (const declared of input.profile.definition.suppliers) {
        const supplier = options.supplierOf({
          ...access,
          profile: input.profile,
          supplier: declared,
        })
        if (!('ok' in supplier)) {
          await releaseAll(acquired)
          return supplier
        }
        if (!sameRoute(supplier.ok, declared)) {
          await releaseAll(acquired)
          return { failure: { kind: 'invalid', field: 'supplier', reason: 'route-mismatch' } }
        }
        const binding = await options.bindings.acquire(supplier.ok, signal)
        if (!('ok' in binding)) {
          await releaseAll(acquired)
          return binding
        }
        acquired.push(binding.ok)
      }
      let facts: CallFactsView = new Map()
      if (lineage.ok !== null) {
        try {
          facts = await readCallFacts({
            reader: options.commands,
            access,
            calls: lineage.ok.calls,
          })
        } catch (error) {
          // A throwing store is a program defect. The bindings are given back before it surfaces.
          await releaseAll(acquired)
          throw error
        }
      }
      return { ok: leaseOf(acquired, lineage.ok, facts) }
    },
  }
  return Object.freeze(resources)
}
