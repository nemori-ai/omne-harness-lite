// The services that the context consumes and that this fixture stands in itself: a meter that
// counts characters as tokens, a sender that answers each call with a scripted ending, and a
// conversion that decides by the kind of block. The profile and preparation services come from the
// public doubles of the testing entry. They exercise the contract shapes; they are not the Model.
import { succeed } from '@omne-harness/operation-result'
import type {
  ConversionResult,
  FixedModelRequest,
  ModelCountingBasis,
  ModelInputMeter,
  ModelCallId,
  RequestBudget,
  Termination,
} from '@omne-harness/model-contract'
import type { ModelMessageConversion } from '@omne-harness/model-contract/provider'
import { blocksOf, inputBound, referencesOf, type MeterInput } from './meter-input.ts'
import { adoption, evidence, profile, textBlock, type Principal } from './values.ts'

export const basis: ModelCountingBasis = {
  supplier: profile.definition.suppliers[0],
  meter: adoption('meter'),
  tokenization: { kind: 'not-used', method: adoption('method') },
  prompt: { kind: 'declared-template', template: adoption('template') },
  projection: adoption('projection'),
  mediaTransform: adoption('media'),
  replay: adoption('replay'),
  evidence: adoption('evidence'),
}

export type CountingMeter = ModelInputMeter & Readonly<{ measured(): number }>

type MeterAnswer = (input: MeterInput) => ReturnType<ModelInputMeter['measure']>

/** A meter that answers as told and counts how often it was asked. */
export function createMeterWith(answer: MeterAnswer): CountingMeter {
  let measured = 0
  return {
    basis,
    measured: () => measured,
    measure(input) {
      measured += 1
      return answer(input)
    },
  }
}

/**
 * A meter that counts one token per character. Its budget holds a check of the count against the
 * most that the profile allows, which is the separate input limit or the window less the output
 * limit; it refuses nothing for its size, because whether the count passes the compaction
 * trigger or the limit is for the context to judge. It is the context that calls it, before it
 * asks for a preparation.
 */
export function createMeter(): CountingMeter {
  return createMeterWith(input => {
    const blocks = blocksOf(input.assembled)
    const tokens = blocks.reduce((sum, block) => sum + ('text' in block ? block.text.length : 0), 0)
    const [first, ...rest] = referencesOf(blocks)
    const common = {
      inputDigest: String(tokens),
      checks: [
        {
          supplier: adoption('supplier'),
          metric: 'input-tokens',
          subject: 'request',
          measurement: { kind: 'exact', amount: String(tokens), method: adoption('method') },
          limit: String(inputBound(input.context)),
          constraint: { profile: input.profile, upstream: { kind: 'unknown' } },
        },
      ],
      counting: [basis],
    } as const
    const budget: RequestBudget =
      first === undefined
        ? { ...common, kind: 'complete' }
        : { ...common, kind: 'deferred-media', references: [first, ...rest] }
    return succeed(budget)
  })
}

export type SentCall = Readonly<{ call: ModelCallId; request: FixedModelRequest }>

/** What the context sends a request through: the call surface, reduced to what the context asks. */
export interface Sender {
  send(input: SentCall): Promise<Termination>
}

export type ScriptedSender = Sender & Readonly<{ sent(): readonly SentCall[] }>

/** A sender that ends the first call with the first termination of the script, the next with the next. */
export function createSender(endings: readonly Termination[]): ScriptedSender {
  const sent: SentCall[] = []
  return {
    sent: () => sent,
    async send(input) {
      const ending = endings[sent.length]
      sent.push(input)
      if (ending === undefined) throw new Error('the script has no ending for this call')
      return ending
    },
  }
}

export function createConversion(): ModelMessageConversion<Principal> {
  return {
    async prepare({ original }) {
      if (original.kind === 'voice')
        return succeed<ConversionResult>({
          kind: 'converted',
          value: {
            original,
            derived: [textBlock(`${original.id}-text`, 'hello there')],
            transcript: 'hello there',
            converter: adoption('transcriber'),
          },
        })
      if ('ref' in original)
        return succeed<ConversionResult>({
          kind: 'deferred',
          original,
          source: evidence('deferred'),
        })
      return succeed<ConversionResult>({
        kind: 'unchanged',
        original,
        reason: original.kind === 'text' ? 'text' : 'no-converter',
      })
    },
  }
}
