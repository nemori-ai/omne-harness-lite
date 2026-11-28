import { succeed } from '@omne-harness/operation-result'
import type {
  LlmModelRequest,
  ModelCountingBasis,
  ModelInputMeter,
  ModelCallId,
  RequestBudget,
  Termination,
} from '@omne-harness/model-contract'
import { blocksOf, inputBound, referencesOf, type MeterInput } from './meter-input.ts'
import { adoption, profile } from './values.ts'

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

type MeterAnswer = (input: MeterInput) => Awaited<ReturnType<ModelInputMeter['measure']>>

export function createMeterWith(answer: MeterAnswer): CountingMeter {
  let measured = 0
  return {
    basis,
    measured: () => measured,
    async measure(input) {
      measured += 1
      return answer(input)
    },
  }
}

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

export type SentCall = Readonly<{ call: ModelCallId; request: LlmModelRequest }>

export interface Sender {
  send(input: SentCall): Promise<Termination>
}

export type ScriptedSender = Sender & Readonly<{ sent(): readonly SentCall[] }>

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
