import type { Checked, ValidationIssue } from '@omne-harness-lite/work-data'

/**
 * Budget failure categories. Results use the shared `Checked` / `ValidationIssue`
 * shape from work-data (one definition per concept); the category is carried as
 * the message prefix, and only `capacity` maps to the shared `capacity` code.
 */
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

export function issueOf(code: BudgetIssueCode, message: string, path = ''): ValidationIssue {
  return Object.freeze({
    path,
    code: code === 'capacity' ? 'capacity' : 'schema',
    message: `${code}: ${message}`,
  })
}

export function accepted<T>(value: T): Checked<T> {
  return Object.freeze({ ok: true, value })
}

export function rejected<T>(code: BudgetIssueCode, message: string, path = ''): Checked<T> {
  return rejectedWith([issueOf(code, message, path)])
}

export function rejectedWith<T>(issues: readonly ValidationIssue[]): Checked<T> {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) })
}

export function isRejected<T>(value: Checked<T>): value is Extract<Checked<T>, { ok: false }> {
  return !value.ok
}
