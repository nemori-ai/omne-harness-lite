import { expectTypeOf } from 'vitest'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  ExactDecimal,
  AccountGroup,
  summarize,
  summarizeUsage,
  type AttemptId,
  type Usage,
  type Cost,
  type TrimSummary,
  type AccountRejection,
  type ModelUsageInput,
  type UsageSummaryResult,
} from '../src/index.ts'

expectTypeOf<AttemptId>().toEqualTypeOf<JsonNumber>()
expectTypeOf<Cost['cost_usd']>().toEqualTypeOf<JsonNumber | 'unknown'>()
expectTypeOf<Usage['reasoning_tokens']>().toEqualTypeOf<JsonNumber | undefined>()
expectTypeOf<TrimSummary['merged']>().toEqualTypeOf<JsonNumber>()
expectTypeOf<AccountRejection>().toEqualTypeOf<
  | 'correction_without_target'
  | 'malformed'
  | 'negative_amount'
  | 'unknown_with_source'
  | 'total_not_unknown'
>()
declare const usage: Usage
// @ts-expect-error cache_tokens is derived and never an exchange/storage field.
usage.cache_tokens
// @ts-expect-error total_tokens is derived and never an exchange/storage field.
usage.total_tokens
// @ts-expect-error arbitrary JSON cannot become an admitted group by structural typing.
summarize({ models: [], tools: [], corrections: [] })
// @ts-expect-error no mirror or total_usd authority projection parameter.
summarize({ total_usd: 2, items: [] })
// @ts-expect-error the private constructor is not a public bypass around admission.
new AccountGroup(Symbol('fake'), [], [])
// @ts-expect-error strings are not numeric exchange values.
ExactDecimal.from('0.1')
declare const models: readonly ModelUsageInput[]
expectTypeOf(summarizeUsage(models)).toEqualTypeOf<UsageSummaryResult>()
declare const group: AccountGroup
// @ts-expect-error monetary groups are not inputs of the model-only usage helper.
summarizeUsage(group)
// @ts-expect-error costs are not inputs of the model-only usage helper.
summarizeUsage([{ responseId: 'r1', usage, cost: { cost_usd: 1, source: 'upstream_usage' } }])
// @ts-expect-error tool usage is not a model authority input.
summarizeUsage([{ sessionLog: 's1', usage }])
