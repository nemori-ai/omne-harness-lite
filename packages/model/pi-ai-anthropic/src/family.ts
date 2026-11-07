// The Anthropic family: the records, the rules and the meter become one `PiFamily`. `acquire`
// acquires a private tokenizer lease, checks its definition against the record, and binds through the
// gateway engine. Nothing here reads the environment, a file or the network.
import type { Adoption, TokenizerDefinition, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { defineFamily, type PiFamily, type PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import {
  bindChatCompletions,
  type ChatCompletionsLimits,
} from '@omne-harness/pi-ai-transport/chat-completions'
import type { TiktokenExecutor, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { createAnthropicMeter, type MeterMargin } from './meter.ts'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord } from './record.ts'
import { ANTHROPIC_RECORDS } from './records.ts'
import { hooksOf } from './rules.ts'

export type AnthropicFamilyConfig = Readonly<{
  /** Usually `anthropicTokenizerResources()`. The definition must equal the one the records name. */
  tokenizer: TiktokenResources
  executor: Pick<TiktokenExecutor, 'acquire'>
  /** Maximum UTF-8 bytes of the complete serialized token input. */
  maxSerializedBytes: number
  /** The decoder buffer limits of every binding. */
  limits: ChatCompletionsLimits
  /** The margin of every input estimate and the adoption of that margin policy. */
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
  return { failure: { kind: 'unavailable', dependency: ANTHROPIC_OWNER, diagnostic } }
}

function checkTokenizerConfig(config: AnthropicFamilyConfig): void {
  if (typeof config.tokenizer !== 'object' || config.tokenizer === null)
    throw new RangeError('config.tokenizer must be the tokenizer resources')
  if (typeof config.executor?.acquire !== 'function')
    throw new RangeError('config.executor must acquire tokenizer leases')
  if (!Number.isSafeInteger(config.maxSerializedBytes) || config.maxSerializedBytes <= 0)
    throw new RangeError('config.maxSerializedBytes must be a positive safe integer')
}

/** Throws `RangeError` for a configuration that no binding could use. */
function checkConfig(config: AnthropicFamilyConfig): void {
  if (typeof config !== 'object' || config === null)
    throw new RangeError('the Anthropic family configuration must be an object')
  checkTokenizerConfig(config)
  if (typeof config.limits !== 'object' || config.limits === null)
    throw new RangeError('config.limits must be the decoder limits')
  if (typeof config.margin !== 'object' || config.margin === null)
    throw new RangeError('config.margin must be an object')
  if (typeof config.margin.percent !== 'string' || !DECIMAL.test(config.margin.percent))
    throw new RangeError('config.margin.percent must be a non-negative decimal integer')
}

/**
 * The family borrows the configured executor and acquires one private tokenizer lease per binding.
 * Throws `RangeError` for an unusable configuration.
 *
 * `acquire(record, supplier, signal)`:
 * - the configured tokenizer definition differs from the record: `unavailable`,
 *   `tokenizer-definition-mismatch`;
 * - the executor refuses a tokenizer lease: `unavailable`, `tokenizer-<failure kind>`;
 * - the signal is aborted: `unavailable`, `cancelled`;
 * - else the binding of the gateway engine. Release awaits its private tokenizer lease cleanup.
 */
export function createAnthropicFamily(config: AnthropicFamilyConfig): PiFamily {
  checkConfig(config)
  return defineFamily<AnthropicRecord>({
    owner: ANTHROPIC_OWNER,
    records: ANTHROPIC_RECORDS,
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
            meter: createAnthropicMeter(
              record,
              tokenizer.ok.tokenizer,
              config.margin,
              config.maxSerializedBytes,
            ),
            limits: config.limits,
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
