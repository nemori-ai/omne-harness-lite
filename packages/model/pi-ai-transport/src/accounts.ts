import { ExactDecimal, type Usage, type Cost } from '@omne-harness-lite/call-accounts'
import {
  LosslessNumber,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonNumber,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { member } from './json.ts'
import type { Diagnostic } from './http.ts'

export function accountFromUsage(
  raw: JsonObject,
  diagnostic: (event: Diagnostic) => void,
): { usage: Usage; cost: Cost } {
  const prompt = raw.prompt_tokens,
    read = member(raw.prompt_tokens_details, 'cached_tokens'),
    write = member(raw.prompt_tokens_details, 'cache_write_tokens')
  let input: Usage['input_tokens'] = 'unknown',
    cacheRead: Usage['cache_read_tokens'] = 'unknown',
    cacheWrite: Usage['cache_write_tokens'] = 'unknown'
  if (isNonNegativeJsonInteger(read)) cacheRead = read
  if (isNonNegativeJsonInteger(write)) cacheWrite = write
  if (
    isNonNegativeJsonInteger(prompt) &&
    isNonNegativeJsonInteger(read) &&
    isNonNegativeJsonInteger(write)
  ) {
    const remainder = ExactDecimal.from(prompt)
      .add(ExactDecimal.from(newNumberMinus(read)))
      .add(ExactDecimal.from(newNumberMinus(write)))
    if (remainder.compare(ExactDecimal.from(0)) >= 0) input = remainder.toJsonNumber()
    else {
      input = 'unknown'
      cacheRead = 'unknown'
      cacheWrite = 'unknown'
      diagnostic({ kind: 'model_transport.usage_inconsistent', level: 'error' })
    }
  }
  const output = isNonNegativeJsonInteger(raw.completion_tokens) ? raw.completion_tokens : 'unknown'
  const reasoning = member(raw.completion_tokens_details, 'reasoning_tokens')
  const reportedCost = raw.cost
  const upstream = member(raw.cost_details, 'upstream_inference_cost')
  return {
    usage: {
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
      source: 'upstream',
      ...(isNonNegativeJsonInteger(reasoning) ? { reasoning_tokens: reasoning } : {}),
    },
    cost:
      isJsonNumber(reportedCost) &&
      ExactDecimal.from(reportedCost).compare(ExactDecimal.from(0)) >= 0
        ? {
            cost_usd: reportedCost,
            source: 'upstream_usage',
            ...(isJsonNumber(upstream) &&
            ExactDecimal.from(upstream).compare(ExactDecimal.from(0)) >= 0
              ? { upstream_inference_cost_usd: upstream }
              : {}),
          }
        : { cost_usd: 'unknown', source: 'none' },
  }
}
function newNumberMinus(value: JsonNumber): JsonNumber {
  const number = ExactDecimal.from(value).toString()
  return new LosslessNumber(number.startsWith('-') ? number.slice(1) : `-${number}`)
}
