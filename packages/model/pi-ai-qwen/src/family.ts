import type { Adoption, TokenizerDefinition, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { defineFamily, type PiFamily, type PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import {
  bindChatCompletions,
  type ChatCompletionsLimits,
} from '@omne-harness/pi-ai-transport/chat-completions'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createQwenMeter, type MeterMargin } from './meter.ts'
import { QWEN_OWNER } from './owner.ts'
import type { QwenRecord } from './record.ts'
import { QWEN_RECORDS } from './records.ts'
import { hooksOf } from './rules.ts'

export type QwenFamilyConfig = Readonly<{
  tokenizer: TiktokenResources
  executor: Pick<TiktokenExecutor, 'acquire'>
  limits: ChatCompletionsLimits
  margin: MeterMargin
}>

const DECIMAL = /^(0|[1-9][0-9]*)$/

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function sameDefinition(left: TokenizerDefinition, right: TokenizerDefinition): boolean {
  return (
    sameAdoption(left.adoption, right.adoption) &&
    sameAdoption(left.implementation, right.implementation) &&
    sameAdoption(left.vocabulary, right.vocabulary) &&
    sameAdoption(left.configuration, right.configuration)
  )
}

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: QWEN_OWNER, diagnostic } }
}

function checkConfig(config: QwenFamilyConfig): void {
  if (typeof config !== 'object' || config === null)
    throw new RangeError('the Qwen family configuration must be an object')
  if (typeof config.tokenizer !== 'object' || config.tokenizer === null)
    throw new RangeError('config.tokenizer must be the tokenizer resources')
  if (typeof config.executor?.acquire !== 'function')
    throw new RangeError('config.executor must acquire tokenizer leases')
  if (typeof config.limits !== 'object' || config.limits === null)
    throw new RangeError('config.limits must be the decoder limits')
  if (typeof config.margin !== 'object' || config.margin === null)
    throw new RangeError('config.margin must be an object')
  if (typeof config.margin.percent !== 'string' || !DECIMAL.test(config.margin.percent))
    throw new RangeError('config.margin.percent must be a non-negative decimal integer')
}

/** The byte limit of one voice clip, as the profile of this record declares it. */
function voiceBytesOf(record: QwenRecord): number {
  const limit = record.profile.limits.find(each => each.metric === 'voice-bytes')
  if (limit === undefined) throw new RangeError(`record ${record.name} has no voice-bytes limit`)
  return Number(limit.provided)
}

export function createQwenFamily(config: QwenFamilyConfig): PiFamily {
  checkConfig(config)
  return defineFamily<QwenRecord>({
    owner: QWEN_OWNER,
    records: QWEN_RECORDS,
    async acquire(record, supplier, signal): Promise<Outcome<PiFamilyBinding, TransportFailure>> {
      if (!sameDefinition(config.tokenizer.definition, record.meter.tokenizer))
        return unavailable('tokenizer-definition-mismatch')
      if (signal.aborted) return unavailable('cancelled')
      const tokenizer = config.executor.acquire(config.tokenizer.definition, signal)
      if (!('ok' in tokenizer)) return unavailable(`tokenizer-${tokenizer.failure.kind}`)
      try {
        return {
          ok: bindChatCompletions({
            record,
            supplier,
            hooks: hooksOf(record),
            meter: createQwenMeter(record, tokenizer.ok.tokenizer, config.margin),
            limits: config.limits,
            voiceBytes: voiceBytesOf(record),
            release: async () => {
              const released = await tokenizer.ok.release()
              if ('failure' in released) throw new Error(`tokenizer-${released.failure.kind}`)
            },
          }),
        }
      } catch (error) {
        await tokenizer.ok.release()
        throw error
      }
    },
  })
}
