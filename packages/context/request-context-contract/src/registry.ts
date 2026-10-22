import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { PromptSection, PromptVariable, PromptContributionSet } from './values.js'
export type ContributionRejection =
  | 'no-scope'
  | 'duplicate-name'
  | 'per-request-variable'
  | 'unknown-variable'
  | 'closed'
export type ContributionResult =
  | Readonly<{
      kind: 'registered'
      name: string
      scope: ScopeRef | null
      revision: string
      dispose: () => void
    }>
  | Readonly<{ kind: 'rejected'; reason: ContributionRejection; name: string }>
export type ContributionsResult =
  | Readonly<{ kind: 'current'; set: PromptContributionSet }>
  | Readonly<{ kind: 'rejected'; reason: 'closed' }>

/** 登记面操作类型。作用域不是参数：托管实现从调用方的 intercept 配置取得（RQD 性质 4、7）。 */
export interface PromptContributionRegistry {
  contributeSection(section: Omit<PromptSection, 'scope' | 'revision'>): ContributionResult
  contributeVariable(variable: Omit<PromptVariable, 'scope' | 'revision'>): ContributionResult
  contributions(scope: ScopeRef | null): ContributionsResult
}
