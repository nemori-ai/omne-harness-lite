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
import type { MessageId } from '@omne-harness/message'
import type { CalibratedInputMeter } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { sameAdoption } from '../adoption.ts'
import { callFacts, type CallFacts, type CallFactsReader } from './facts.ts'
import { judgeAnchor, judgeOutputs, stateMessages } from './judge.ts'
import { parseLineage, type Lineage } from './lineage.ts'

export type PreparationBinding = Readonly<{
  supplier: Supplier
  rules: ModelRequestRules
  meter: CalibratedInputMeter
  release(): Promise<void>
}>

export interface PreparationBindingSource {
  acquire(
    supplier: Supplier,
    signal: AbortSignal,
  ): Promise<Outcome<PreparationBinding, TransportFailure>>
}

export type SupplierPort<P> = (
  input: Access<P> & Readonly<{ profile: ModelProfile; supplier: ProfileSupplier }>,
) => Outcome<Supplier, ModelFailure>

export type ModelPreparationOptions<P> = Readonly<{
  commands: CallFactsReader<P>
  bindings: PreparationBindingSource
  supplierOf: SupplierPort<P>
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
    supplier.provider === declared.provider &&
    supplier.model === declared.model
  )
}

async function releaseAll(acquired: readonly PreparationBinding[]): Promise<Released> {
  const results = await Promise.allSettled(acquired.map(async binding => binding.release()))
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

type Measured = Awaited<ReturnType<ModelInputMeter['measure']>>

function releasedAnswer(): Measured {
  return {
    failure: { kind: 'unavailable', dependency: LEASE, diagnostic: 'preparation-lease-released' },
  }
}

function supplierName(binding: PreparationBinding): string {
  const { owner, name, revision } = binding.supplier.adoption
  return `${owner}/${name}@${revision}`
}

function lineageMeter(
  binding: PreparationBinding,
  lineage: Lineage,
  factsOf: () => CallFacts | null,
): ModelInputMeter {
  const meter: ModelInputMeter = {
    basis: binding.meter.basis,
    async measure(input) {
      const facts = factsOf()
      if (facts === null) return releasedAnswer()
      const supplier = binding.supplier.adoption
      const { continues, sources } = lineage
      const anchor = judgeAnchor({
        continues,
        facts: await facts.view(continues === null ? [] : [continues]),
        supplier,
        representation: input.representation,
        messages: input.assembled.messages.map(message => message.id),
      })
      const hit =
        anchor.kind === 'hit' ? { covered: anchor.covered, inputTotal: anchor.inputTotal } : null
      const outputsBeyond = async (covered: readonly MessageId[]) => {
        const messages = stateMessages(input.assembled.messages, covered)
        const calls = messages.flatMap(message => sources.get(message.id) ?? [])
        return judgeOutputs({ sources, facts: await facts.view(calls), supplier, messages })
      }
      let measured = await binding.meter.measureCalibrated(input, {
        anchor: hit,
        outputs: await outputsBeyond(hit?.covered ?? []),
      })
      // A measurement that needed an output not yet read fails; read the covered ones and measure again.
      if (hit !== null && !('ok' in measured))
        measured = await binding.meter.measureCalibrated(input, {
          anchor: hit,
          outputs: await outputsBeyond([]),
        })
      if (factsOf() === null) return releasedAnswer()
      if (!('ok' in measured)) return measured
      if (anchor.kind === 'miss') return { ok: { ...measured.ok, calibration: { anchor } } }
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
  facts: CallFacts,
  controller: AbortController,
): ModelPreparationLease {
  const [first, ...rest] = acquired
  if (first === undefined) throw new TypeError('a profile names at least one supplier')
  let released: Promise<Released> | undefined
  let view: CallFacts | null = facts
  const factsOf = (): CallFacts | null => view
  const pending = new Set<Promise<void>>()
  const guarded = (meter: ModelInputMeter): ModelInputMeter =>
    Object.freeze({
      basis: meter.basis,
      async measure(input: Parameters<ModelInputMeter['measure']>[0]) {
        if (released !== undefined) return releasedAnswer()
        const completion = Promise.withResolvers<void>()
        pending.add(completion.promise)
        try {
          const result = await meter.measure(input)
          return released !== undefined ? releasedAnswer() : result
        } finally {
          pending.delete(completion.promise)
          completion.resolve()
        }
      },
    })
  const bindingOf = (binding: PreparationBinding): Binding =>
    Object.freeze({
      supplier: binding.supplier,
      rules: binding.rules,
      meter: guarded(lineage === null ? binding.meter : lineageMeter(binding, lineage, factsOf)),
    })
  const lease: ModelPreparationLease = {
    bindings: [bindingOf(first), ...rest.map(bindingOf)],
    release: () => {
      if (released !== undefined) return released
      released = Promise.resolve().then(async () => {
        await Promise.allSettled(pending)
        return releaseAll(acquired)
      })
      controller.abort()
      view = null
      return released
    },
  }
  return Object.freeze(lease)
}

async function bindAll<P>(
  input: Readonly<{
    options: ModelPreparationOptions<P>
    access: Access<P>
    profile: ModelProfile
    acquired: PreparationBinding[]
    signal: AbortSignal
  }>,
): Promise<Outcome<undefined, ModelFailure>> {
  const { options, access, profile, acquired, signal } = input
  for (const declared of profile.definition.suppliers) {
    const supplier = options.supplierOf({ ...access, profile, supplier: declared })
    if (!('ok' in supplier)) return supplier
    if (!sameRoute(supplier.ok, declared))
      return { failure: { kind: 'invalid', field: 'supplier', reason: 'route-mismatch' } }
    const binding = await options.bindings.acquire(supplier.ok, signal)
    if (!('ok' in binding)) return binding
    acquired.push(binding.ok)
  }
  return { ok: undefined }
}

export function createModelPreparationResources<P>(
  options: ModelPreparationOptions<P>,
): ModelPreparationResources<P> {
  checkOptions(options)
  const resources: ModelPreparationResources<P> = {
    async acquire(input) {
      const lineage = parseLineage(input.lineage, options.maxCitedCalls)
      if (!('ok' in lineage)) return lineage
      const access: Access<P> = { principal: input.principal, tenant: input.tenant }
      const profile = structuredClone(input.profile)
      const acquired: PreparationBinding[] = []
      const controller = new AbortController()
      let bound: Outcome<undefined, ModelFailure>
      try {
        bound = await bindAll({ options, access, profile, acquired, signal: controller.signal })
      } catch (error) {
        controller.abort()
        await releaseAll(acquired)
        throw error
      }
      if (!('ok' in bound)) {
        controller.abort()
        await releaseAll(acquired)
        return bound
      }
      const facts = callFacts(options.commands, access)
      return { ok: leaseOf(acquired, lineage.ok, facts, controller) }
    },
  }
  return Object.freeze(resources)
}
