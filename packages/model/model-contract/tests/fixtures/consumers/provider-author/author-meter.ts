// An input meter as an author writes it against the contract: it counts the words of the text
// that the request will carry, reports the count against what the profile's context limits allow,
// and keeps media that is still only a reference as deferred, without reading it. It refuses
// nothing for its size: whether the count passes a threshold is for the request assembler to
// judge, which calls a meter before it asks for a preparation. The send path never does.
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

/** The most tokens an input may hold: the separate input limit, else the window less the output limit. */
export function inputBound(context: MeterInput['context']): bigint {
  if (context.input !== null) return BigInt(context.input.provided)
  return BigInt(context.window.provided) - BigInt(context.output.provided)
}

export function createWordMeter(basis: ModelCountingBasis): ModelInputMeter {
  return {
    basis,
    measure(input) {
      const words = wordsIn(input.representation.tokenInput)
      const bound = inputBound(input.context)
      // In the counting basis of this meter a token is a word, so the count is exact. A count
      // over the bound is reported as it is; the check carries the limit for the assembler.
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

/** The text that a request will carry, from the segments of its token input. */
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

/**
 * A meter that holds a tokenizer and nothing else: no template that wraps the roles, no tool
 * projection, no media transform and no replay rule. The tokenizer says how many tokens the text
 * has, and the text is only a part of what the supplier will count, so this meter gives no budget
 * and names what it lacks. The count it did make is in the reason, and it is not a budget.
 */
export function createTokenizerOnlyMeter(
  tokenizer: ModelTextTokenizer,
  basis: ModelCountingBasis,
): ModelInputMeter {
  return {
    basis,
    measure(input) {
      const counted = tokenizer.count([
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
