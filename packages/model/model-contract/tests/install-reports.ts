// Reads what the entries of the install-closure facility print on stdout. A report that does not
// have the fields the specs read is an error with a name, not a value of the wrong shape, so a
// facility that printed something else turns the spec red where the report is read.
import type { Violation } from './install/closure.ts'
import type { Check, Report } from './install/consumer.ts'
import { isPathResult, isRecord } from './install/fixture-run.ts'
import type { FixtureSetReport, FixtureSummary } from './install/fixture-set.ts'

/** The fields of a facility report that the specs of the entries look at. */
export type EntryReport = Pick<Report, 'checks' | 'ok' | 'forbidden' | 'tarballs'>

function isCheck(value: unknown): value is Check {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['ok'] === 'boolean' &&
    typeof value['detail'] === 'string'
  )
}

function isViolation(value: unknown): value is Violation {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['category'] === 'string' &&
    Array.isArray(value['via'])
  )
}

function isTarball(value: unknown): value is Report['tarballs'][number] {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['file'] === 'string' &&
    Array.isArray(value['files'])
  )
}

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isSummary(value: unknown): value is FixtureSummary {
  return (
    isRecord(value) &&
    typeof value['role'] === 'string' &&
    typeof value['directory'] === 'string' &&
    typeof value['ok'] === 'boolean' &&
    Array.isArray(value['paths']) &&
    value['paths'].every(isPathResult) &&
    Array.isArray(value['failedChecks']) &&
    value['failedChecks'].every(
      item =>
        isRecord(item) && typeof item['id'] === 'string' && typeof item['detail'] === 'string',
    )
  )
}

/** The report of `cli.ts`, or an error that says which field is wrong. */
export function readEntryReport(text: string): EntryReport {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) throw new Error('the report is not a JSON object')
  const { checks, ok, forbidden, tarballs } = value
  if (typeof ok !== 'boolean') throw new Error('the report has no boolean ok')
  if (!Array.isArray(checks) || !checks.every(isCheck))
    throw new Error('the report checks are wrong')
  if (!Array.isArray(forbidden) || !forbidden.every(isViolation))
    throw new Error('the report forbidden list is wrong')
  if (!Array.isArray(tarballs) || !tarballs.every(isTarball))
    throw new Error('the report tarballs are wrong')
  return { checks, ok, forbidden, tarballs }
}

/** The report of `fixtures.ts`, or an error that says which field is wrong. */
export function readSetReport(text: string): FixtureSetReport {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) throw new Error('the report is not a JSON object')
  const { member, ok, problems, fixtures } = value
  if (typeof member !== 'string' || typeof ok !== 'boolean')
    throw new Error('the set report has no member or ok')
  if (!isTextList(problems)) throw new Error('the set report problems are wrong')
  if (!Array.isArray(fixtures) || !fixtures.every(isSummary))
    throw new Error('the set report fixtures are wrong')
  return { member, ok, problems, fixtures }
}
