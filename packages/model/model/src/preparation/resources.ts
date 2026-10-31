// The production `ModelPreparationResources`. A lease acquires one family binding per profile
// supplier, reads the facts of the calls the lineage names once with the access of the caller,
// and hands out meters. Without a lineage the meter answers what the family meter answers. With
// one, the meter judges the anchor and the sources synchronously, calls the family's
// `measureCalibrated`, and writes the verdict into the budget. After release every meter of the
// lease is unavailable, and the lease drops its view of the facts.
import type {
  Access,
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
import type { CalibratedInputMeter } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { sameAdoption } from '../adoption.ts'
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
  return (
    sameAdoption(supplier.adoption, declared.adoption) &&
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

/** `owner/name@revision` of the supplier adoption of a binding, for a defect message. */
function supplierName(binding: PreparationBinding): string {
  const { owner, name, revision } = binding.supplier.adoption
  return `${owner}/${name}@${revision}`
}

/**
 * The meter of one binding under a lineage: synchronous, reads nothing, judges, delegates.
 * `factsOf` gives the view of the facts until release and `null` after it.
 */
function lineageMeter(
  binding: PreparationBinding,
  lineage: Lineage,
  factsOf: () => CallFactsView | null,
): ModelInputMeter {
  const meter: ModelInputMeter = {
    basis: binding.meter.basis,
    measure(input) {
      const facts = factsOf()
      if (facts === null) return releasedAnswer()
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
      if (anchor.kind === 'miss') return { ok: { ...measured.ok, calibration: { anchor } } }
      // A meter handed an anchor reports its verdict: `hit`, or the `continuation-shrank` that only
      // the family can judge. Without one the lease cannot tell which, so it does not guess.
      const reported = measured.ok.calibration?.anchor
      if (reported === undefined)
        throw new TypeError(
          `the CalibratedInputMeter of supplier ${supplierName(binding)} was handed an anchor and reported no anchor verdict`,
        )
      return { ok: { ...measured.ok, calibration: { anchor: reported } } }
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
  // The view of the facts until release; release drops it, so no meter keeps it alive.
  let view: CallFactsView | null = facts
  const factsOf = (): CallFactsView | null => view
  const isReleased = (): boolean => released !== undefined
  const bindingOf = (binding: PreparationBinding): Binding =>
    Object.freeze({
      supplier: binding.supplier,
      rules: binding.rules,
      meter:
        lineage === null
          ? plainMeter(binding, isReleased)
          : lineageMeter(binding, lineage, factsOf),
    })
  const lease: ModelPreparationLease = {
    bindings: [bindingOf(first), ...rest.map(bindingOf)],
    release: () => {
      view = null
      released ??= releaseAll(acquired)
      return released
    },
  }
  return Object.freeze(lease)
}

/**
 * Acquires one binding per supplier of the profile into `acquired`, then reads the facts of the
 * calls of the lineage. Stops at the first failure and returns it; what it acquired stays in
 * `acquired` for the caller to give back.
 */
async function bindThenRead<P>(
  input: Readonly<{
    options: ModelPreparationOptions<P>
    access: Access<P>
    profile: ModelProfile
    lineage: Lineage | null
    acquired: PreparationBinding[]
  }>,
): Promise<Outcome<CallFactsView, ModelFailure>> {
  const { options, access, profile, lineage, acquired } = input
  const signal = new AbortController().signal
  for (const declared of profile.definition.suppliers) {
    const supplier = options.supplierOf({ ...access, profile, supplier: declared })
    if (!('ok' in supplier)) return supplier
    if (!sameRoute(supplier.ok, declared))
      return { failure: { kind: 'invalid', field: 'supplier', reason: 'route-mismatch' } }
    const binding = await options.bindings.acquire(supplier.ok, signal)
    if (!('ok' in binding)) return binding
    acquired.push(binding.ok)
  }
  if (lineage === null) return { ok: new Map() }
  return { ok: await readCallFacts({ reader: options.commands, access, calls: lineage.calls }) }
}

/**
 * Lease life: `acquire` creates the bindings (one per supplier, all or nothing) and the facts view
 * (every named call read once, here); `measure` reads nothing; `release` is idempotent, drops the
 * facts view, and a later `measure` of any meter of the lease is `unavailable`
 * (`preparation-lease-released`). Nothing is kept across leases. Throws `RangeError` for options
 * no lease could use. A supplier port, binding source or store that throws is a program defect:
 * the acquire gives back what it acquired and rethrows.
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
      let facts: Outcome<CallFactsView, ModelFailure>
      try {
        facts = await bindThenRead({
          options,
          access,
          profile: input.profile,
          lineage: lineage.ok,
          acquired,
        })
      } catch (error) {
        // A throwing supplier port, binding source or store is a program defect. The bindings
        // acquired so far are given back before it surfaces.
        await releaseAll(acquired)
        throw error
      }
      if (!('ok' in facts)) {
        // The failure that stopped the acquire is the answer. A failed release on this path is
        // dropped: the original failure says why there is no lease, which the caller needs more
        // than the state of a binding it never received.
        await releaseAll(acquired)
        return facts
      }
      return { ok: leaseOf(acquired, lineage.ok, facts.ok) }
    },
  }
  return Object.freeze(resources)
}
