import { fail, succeed } from '@omne-harness/operation-result'
import type {
  ModelCountingBasis,
  ModelInputMeter,
  RequestBudget,
} from '@omne-harness/model-contract'
import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'

export type MeterInput = Parameters<ModelInputMeter['measure']>[0]
type Tokens = MeterInput['representation']['tokenInput']

function wordsIn(value: Tokens): number {
  switch (value.kind) {
    case 'string':
      return value.value.split(/\s+/u).filter(word => word !== '').length
    case 'array':
      return value.items.reduce((sum, item) => sum + wordsIn(item), 0)
    case 'object':
      return value.entries.reduce((sum, entry) => sum + wordsIn(entry.value), 0)
    case 'null':
    case 'boolean':
    case 'number':
      return 0
  }
}

export function inputBound(context: MeterInput['context']): bigint {
  if (context.input !== null) return BigInt(context.input.provided)
  return BigInt(context.window.provided) - BigInt(context.output.provided)
}

export function createWordMeter(basis: ModelCountingBasis): ModelInputMeter {
  return {
    basis,
    async measure(input) {
      const words = wordsIn(input.representation.tokenInput)
      const bound = inputBound(input.context)
      const check = {
        supplier: input.supplier.adoption,
        metric: 'input-tokens',
        subject: 'request',
        measurement: { kind: 'exact', amount: String(words), method: basis.meter },
        limit: String(bound),
        constraint: { profile: input.profile, upstream: { kind: 'unknown' } },
      } as const
      const common = { inputDigest: String(words), checks: [check], counting: [basis] } as const
      const budget: RequestBudget =
        input.representation.kind === 'pending-media'
          ? { ...common, kind: 'deferred-media', references: input.representation.references }
          : { ...common, kind: 'complete' }
      return succeed(budget)
    },
  }
}

function textOf(value: Tokens): string {
  switch (value.kind) {
    case 'string':
      return value.value
    case 'array':
      return value.items.map(textOf).join(' ')
    case 'object':
      return value.entries.map(entry => textOf(entry.value)).join(' ')
    case 'null':
    case 'boolean':
    case 'number':
      return ''
  }
}

export function createTokenizerOnlyMeter(
  tokenizer: ModelTextTokenizer,
  basis: ModelCountingBasis,
): ModelInputMeter {
  return {
    basis,
    async measure(input) {
      const counted = await tokenizer.count([
        { kind: 'text', text: textOf(input.representation.tokenInput) },
      ])
      if ('failure' in counted)
        return fail({
          kind: 'unavailable',
          dependency: 'tokenizer',
          diagnostic: counted.failure.kind,
        })
      return fail({
        kind: 'unsupported',
        field: `request budget: only the ${counted.ok.tokens} tokens of the text are counted`,
        adapter: basis.meter,
      })
    },
  }
}
