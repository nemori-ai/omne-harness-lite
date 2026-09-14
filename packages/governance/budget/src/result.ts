export type BudgetIssueCode =
  | 'capacity'
  | 'causality'
  | 'currency'
  | 'fact_conflict'
  | 'identity'
  | 'kind'
  | 'money'
  | 'owner'
  | 'ownership'
  | 'record'
  | 'revision'
  | 'shape'
  | 'source_index'
  | 'transition'
  | 'version'

export type BudgetIssue = Readonly<{
  path: string
  code: BudgetIssueCode
  message: string
}>

export type BudgetResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; issues: readonly BudgetIssue[] }>

export function accepted<T>(value: T): BudgetResult<T> {
  return Object.freeze({ ok: true, value })
}

export function rejected<T>(code: BudgetIssueCode, message: string, path = ''): BudgetResult<T> {
  return Object.freeze({
    ok: false,
    issues: Object.freeze([Object.freeze({ path, code, message })]),
  })
}

export function isRejected<T>(
  value: BudgetResult<T>,
): value is Extract<BudgetResult<T>, { ok: false }> {
  return !value.ok
}
