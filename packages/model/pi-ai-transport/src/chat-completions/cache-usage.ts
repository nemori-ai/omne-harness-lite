import type { ModelFault } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { ChatUsage, ChatUsageItem, GatewayUsage } from './vocabulary.ts'

const DECIMAL = /^(0|[1-9][0-9]*)$/
const UNIT = 'token'

function counted(name: string, lexeme: string | null): ChatUsageItem {
  return lexeme === null
    ? { name, state: 'unknown', unit: UNIT }
    : { name, state: 'known', lexeme, unit: UNIT }
}

function cacheWriteOf(usage: GatewayUsage): string | null {
  const details = usage.raw['prompt_tokens_details']
  if (details?.kind !== 'object') return null
  const value = details.entries.find(entry => entry.key === 'cache_write_tokens')?.value
  return value?.kind === 'number' && DECIMAL.test(value.lexeme) ? value.lexeme : null
}

function uncachedInput(
  usage: GatewayUsage,
  write: string | null,
): Readonly<{ lexeme: string | null; negative: boolean }> {
  const { promptTokens, cachedTokens } = usage
  if (promptTokens === null || cachedTokens === null || write === null)
    return { lexeme: null, negative: false }
  const remainder = BigInt(promptTokens) - BigInt(cachedTokens) - BigInt(write)
  return remainder < 0n
    ? { lexeme: null, negative: true }
    : { lexeme: String(remainder), negative: false }
}

export function usageWithCacheWrites(usage: GatewayUsage): Outcome<ChatUsage, ModelFault> {
  const write = cacheWriteOf(usage)
  const input = uncachedInput(usage, write)
  return {
    ok: {
      items: [
        counted('input', input.lexeme),
        counted('output', usage.completionTokens),
        counted('cache-read', usage.cachedTokens),
        counted('cache-write', write),
        counted('reasoning', usage.reasoningTokens),
      ],
      diagnostics: input.negative ? [{ kind: 'usage-inconsistent', field: 'input' }] : [],
    },
  }
}
