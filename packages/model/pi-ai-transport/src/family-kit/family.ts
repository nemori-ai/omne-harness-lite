import type {
  Adoption,
  Supplier,
  TokenizerDefinition,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { ModelTextTokenizer, TokenizationFailure } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { MeterMargin } from '../chat-completions/measurement.ts'
import type { ChatCompletionsLimits } from '../chat-completions/vocabulary.ts'
import { defineFamily, type PiFamily } from '../family-table.ts'
import type { PiFamilyBinding } from '../family.ts'
import type { GatewayRecord, ImageTokenRule } from './record.ts'

export type TokenizerLease = Readonly<{
  tokenizer: ModelTextTokenizer
  release(): Promise<Outcome<undefined, TokenizationFailure>>
}>

export type GatewayFamilyConfig = Readonly<{
  tokenizer: Readonly<{ definition: TokenizerDefinition }>
  executor: Readonly<{
    acquire(
      definition: TokenizerDefinition,
      signal: AbortSignal,
    ): Outcome<TokenizerLease, TokenizationFailure>
  }>
  limits: ChatCompletionsLimits
  margin: MeterMargin
}>

export type GatewayBindingInput = Readonly<{
  supplier: Supplier
  tokenizer: ModelTextTokenizer
  release(): Promise<void>
}>

export type GatewayFamilySpec<R extends GatewayRecord> = Readonly<{
  owner: string
  title: string
  records: readonly R[]
  config: GatewayFamilyConfig
  bind(record: R, input: GatewayBindingInput): PiFamilyBinding
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

function checkMargin(margin: GatewayFamilyConfig['margin']): void {
  if (typeof margin !== 'object' || margin === null)
    throw new RangeError('config.margin must be an object')
  if (typeof margin.percent !== 'string' || !DECIMAL.test(margin.percent))
    throw new RangeError('config.margin.percent must be a non-negative decimal integer')
}

function checkConfig(config: GatewayFamilyConfig, title: string): void {
  if (typeof config !== 'object' || config === null)
    throw new RangeError(`the ${title} family configuration must be an object`)
  if (typeof config.tokenizer !== 'object' || config.tokenizer === null)
    throw new RangeError('config.tokenizer must be the tokenizer resources')
  if (typeof config.executor?.acquire !== 'function')
    throw new RangeError('config.executor must acquire tokenizer leases')
  if (typeof config.limits !== 'object' || config.limits === null)
    throw new RangeError('config.limits must be the decoder limits')
  checkMargin(config.margin)
}

export function byteLimitOf(record: GatewayRecord, metric: string): number | undefined {
  const limit = record.profile.limits.find(each => each.metric === metric)
  return limit === undefined ? undefined : Number(limit.provided)
}

/** A record that may take images: its wire, profile, byte limit and meter rule agree on it. */
export function optionalImageBytes(
  record: GatewayRecord & Readonly<{ meter: Readonly<{ image?: ImageTokenRule }> }>,
): Readonly<{ imageBytes?: number }> {
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

// Each binding holds a tokenizer lease until the binding is released; a binding that throws
// returns its lease. `title` names the family in configuration errors.
export function defineGatewayFamily<R extends GatewayRecord>(spec: GatewayFamilySpec<R>): PiFamily {
  const { owner, config } = spec
  checkConfig(config, spec.title)
  const unavailable = (diagnostic: string): Outcome<never, TransportFailure> => ({
    failure: { kind: 'unavailable', dependency: owner, diagnostic },
  })
  return defineFamily<R>({
    owner,
    records: spec.records,
    async acquire(record, supplier, signal): Promise<Outcome<PiFamilyBinding, TransportFailure>> {
      if (!sameDefinition(config.tokenizer.definition, record.meter.tokenizer))
        return unavailable('tokenizer-definition-mismatch')
      if (signal.aborted) return unavailable('cancelled')
      const tokenizer = config.executor.acquire(config.tokenizer.definition, signal)
      if (!('ok' in tokenizer)) return unavailable(`tokenizer-${tokenizer.failure.kind}`)
      try {
        return {
          ok: spec.bind(record, {
            supplier,
            tokenizer: tokenizer.ok.tokenizer,
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
