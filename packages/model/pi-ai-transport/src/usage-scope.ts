import { openAiFamilyRecord } from './input-meters/openai-family-policy.ts'

export const PRO_TRANSFORM_REVISION = 'openrouter-input-transform/pro-scope-1'
export const READER_REVISION = 'openrouter-usage-reader/2'
export const PRO_READER_REVISION = 'openrouter-usage-reader/3-openai-pro-scope'
export type UsageScope = 'inherited_context_total' | 'scope_unknown'

/** Scope belongs to the declared model row; earlier bindings cannot promote current Pro I. */
export function usageScope(model: string): UsageScope {
  return openAiFamilyRecord(model)?.inputScope ?? 'inherited_context_total'
}
export function readerRevision(scope: UsageScope): string {
  return scope === 'scope_unknown' ? PRO_READER_REVISION : READER_REVISION
}
