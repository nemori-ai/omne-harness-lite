import type * as M from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { BlockId } from '@omne-harness/content-block'
import type {
  ConversionResultSource,
  CompactionPolicyPort,
  RepresentationPolicyPort,
  CompactionPolicy,
  RepresentationPolicyConfig,
} from '../ports.js'
import type { SummaryMaterial } from '../values.js'
import { canonical, digest, textBlock } from '../internal.js'
export type MeterScript = (
  input: Parameters<M.ModelInputMeter['measure']>[0],
) => Outcome<M.RequestBudget, M.TransportFailure>
export interface ScriptedInputMeter extends M.ModelInputMeter {
  readonly durability: 'none'
  calls(): number
}
export function createScriptedInputMeter(
  basis: M.ModelCountingBasis,
  script: MeterScript,
): ScriptedInputMeter {
  let count = 0
  return {
    durability: 'none',
    basis,
    calls: () => count,
    measure(input) {
      count++
      return script(input)
    },
  }
}
export interface MemoryConversionResults<P> extends ConversionResultSource<P> {
  readonly durability: 'none'
  set(block: BlockId, result: M.ConversionResult): void
}
export function createMemoryConversionResults<P>(
  initial: ReadonlyMap<BlockId, M.ConversionResult> = new Map(),
): MemoryConversionResults<P> {
  const entries = new Map(initial)
  return {
    durability: 'none',
    set: (k, v) => {
      entries.set(k, v)
    },
    async read(_access, blocks) {
      return {
        kind: 'index',
        entries: new Map(
          blocks.flatMap(id => {
            const value = entries.get(id)
            return value === undefined ? [] : [[id, value] as const]
          }),
        ),
      }
    },
  }
}
export const FIXTURE_COMPACTION_POLICY: CompactionPolicy = Object.freeze({
  retainBudget: { kind: 'ratio', retainRatio: '0.25' },
  retainPreference: 'newest-first',
  triggerPercent: null,
  headroomTokens: null,
  trimFirst: false,
  stepBound: '2',
} as const)
export const FIXTURE_REPRESENTATION_CONFIG: RepresentationPolicyConfig = Object.freeze({
  preferences: {
    text: ['original', 'derived', 'transcript'],
    image: ['original', 'derived', 'transcript'],
    voice: ['original', 'derived', 'transcript'],
  },
} as const)
const identity = {
  owner: 'request-context-contract/testing',
  name: 'fixture',
  revision: '1',
  digest: 'fixture',
}
/** Deterministic test policy, not a default product strategy. */
export function createScriptedCompactionPolicy(
  config: CompactionPolicy = FIXTURE_COMPACTION_POLICY,
): CompactionPolicyPort & Readonly<{ durability: 'none' }> {
  return {
    durability: 'none',
    identity,
    config,
    configDigest: () => digest(config),
    plan({ context, measure, windowTokens }) {
      const last = context.covered.at(-1)
      if (last === undefined) throw new Error('Fixture needs covered entries')
      const floor = context.open.filter(ref => context.covered.some(x => x.ref === ref))
      const limit =
        config.retainBudget.kind === 'tokens'
          ? Number(config.retainBudget.retainTokens)
          : Number(windowTokens) * Number(config.retainBudget.retainRatio)
      if (Number(measure(floor)) > limit)
        return { kind: 'floor-exceeds-budget', floor, budget: String(Math.floor(limit)) }
      const retained = new Set(floor)
      const ranked =
        config.retainPreference === 'newest-first'
          ? [...context.covered].reverse()
          : [...context.covered]
      for (const item of ranked) {
        if (item.message !== null && Number(measure([...retained, item.ref])) <= limit)
          retained.add(item.ref)
      }
      return {
        kind: 'draft',
        coverTo: last.ref,
        retained: context.covered.filter(x => retained.has(x.ref)).map(x => x.ref),
        bound: config.stepBound,
        shape: config.trimFirst ? 'trim-then-summarize' : 'summarize',
      }
    },
    trim: (material: SummaryMaterial) => material,
    summaryInstruction: material => [
      textBlock(canonical({ task: 'Summarize covered history', retained: material.retained }), {
        kind: 'fixture-summary',
      }),
    ],
  }
}
export function createScriptedRepresentationPolicy(
  config: RepresentationPolicyConfig = FIXTURE_REPRESENTATION_CONFIG,
): RepresentationPolicyPort & Readonly<{ durability: 'none' }> {
  return {
    durability: 'none',
    identity,
    config,
    choose({ block, conversion, modalities }) {
      const modality = block.kind === 'thinking' || block.kind === 'file' ? 'text' : block.kind
      for (const choice of config.preferences[modality]) {
        if (choice === 'original' && modalities.includes(modality)) return 'original'
        if (choice === 'derived' && conversion?.kind === 'converted') return 'derived'
        if (
          choice === 'transcript' &&
          conversion?.kind === 'converted' &&
          modalities.includes('text')
        )
          return 'transcript'
      }
      return 'none'
    },
  }
}
