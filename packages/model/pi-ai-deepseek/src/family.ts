import type { Adoption, TokenizerDefinition, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { defineFamily, type PiFamily, type PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import {
  bindChatCompletions,
  type ChatCompletionsLimits,
} from '@omne-harness/pi-ai-transport/chat-completions'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createDeepSeekMeter, type MeterMargin } from './meter.ts'
import { DEEPSEEK_OWNER } from './owner.ts'
import type { DeepSeekRecord } from './record.ts'
import { effortMapping } from './profiles.ts'
import { DEEPSEEK_RECORDS } from './records.ts'
import { hooksOf } from './rules.ts'

export type DeepSeekFamilyConfig = Readonly<{
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
  return { failure: { kind: 'unavailable', dependency: DEEPSEEK_OWNER, diagnostic } }
}

function checkTokenizerConfig(config: DeepSeekFamilyConfig): void {
  if (typeof config.tokenizer !== 'object' || config.tokenizer === null)
    throw new RangeError('config.tokenizer must be the tokenizer resources')
  if (typeof config.executor?.acquire !== 'function')
    throw new RangeError('config.executor must acquire tokenizer leases')
}

function checkConfig(config: DeepSeekFamilyConfig): void {
  if (typeof config !== 'object' || config === null)
    throw new RangeError('the DeepSeek family configuration must be an object')
  checkTokenizerConfig(config)
  if (typeof config.limits !== 'object' || config.limits === null)
    throw new RangeError('config.limits must be the decoder limits')
  if (typeof config.margin !== 'object' || config.margin === null)
    throw new RangeError('config.margin must be an object')
  if (typeof config.margin.percent !== 'string' || !DECIMAL.test(config.margin.percent))
    throw new RangeError('config.margin.percent must be a non-negative decimal integer')
}

function imageLimits(record: DeepSeekRecord): Readonly<{ imageBytes?: number }> {
  const image = record.wire.image !== null
  const limit = record.profile.limits.find(each => each.metric === 'image-bytes')
  if (
    image !== record.profile.input.includes('image') ||
    image !== (limit !== undefined) ||
    image !== (record.meter.image !== undefined)
  )
    throw new RangeError(`record ${record.name} has inconsistent image support`)
  if (limit === undefined) return {}
  const bytes = Number(limit.provided)
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new RangeError(`record ${record.name} has an invalid image byte limit`)
  return { imageBytes: bytes }
}

export function createDeepSeekFamily(config: DeepSeekFamilyConfig): PiFamily {
  checkConfig(config)
  return defineFamily<DeepSeekRecord>({
    owner: DEEPSEEK_OWNER,
    records: DEEPSEEK_RECORDS,
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
            bindingEfforts: effortMapping(record),
            supplier,
            hooks: hooksOf(record),
            meter: createDeepSeekMeter(record, tokenizer.ok.tokenizer, config.margin),
            limits: config.limits,
            ...imageLimits(record),
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
