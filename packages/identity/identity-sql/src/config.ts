// The configuration of the `identity` row: two login lifetimes as SI-second text (IC-16, data
// only). The plugin validates it once; the provider reads the resulting terms at every issue.
import type { LoginTerms, LoginTermsSource } from '@omne-harness/identity'
import { parseDuration } from '@omne-harness/utc-instant'
import { isPositive } from './deadline.ts'

/** `PT<seconds>S` text for both lifetimes. Each must be longer than zero. */
export type IdentitySqlConfig = Readonly<{ maxLifetime: string; idlePeriod: string }>

/** The first value of the configuration: 30 days and 7 days (DP3-C15). */
export const IDENTITY_SQL_DEFAULT_CONFIG: IdentitySqlConfig = Object.freeze({
  maxLifetime: 'PT2592000S',
  idlePeriod: 'PT604800S',
})

export type ConfigProblem = Readonly<{ field: string; rule: string }>

export type IdentitySqlConfigJudgement =
  | Readonly<{ kind: 'valid'; config: IdentitySqlConfig; terms: LoginTerms }>
  | Readonly<{ kind: 'invalid'; problems: readonly ConfigProblem[] }>

const FIELDS = ['maxLifetime', 'idlePeriod'] as const

type Field = (typeof FIELDS)[number]

function judgeField(
  input: Readonly<Record<string, unknown>>,
  field: Field,
): Readonly<{ ok: true; duration: LoginTerms[Field] } | { ok: false; problem: ConfigProblem }> {
  const value = input[field]
  if (typeof value !== 'string')
    return { ok: false, problem: { field, rule: 'must be PT<seconds>S text' } }
  const parsed = parseDuration(value)
  if (!parsed.ok) return { ok: false, problem: { field, rule: 'must be PT<seconds>S text' } }
  if (!isPositive(parsed.value))
    return { ok: false, problem: { field, rule: 'must be longer than zero' } }
  return { ok: true, duration: parsed.value }
}

/** Judges a raw configuration. Lists every problem, not only the first. Unknown fields are problems. */
export function parseIdentitySqlConfig(input: unknown): IdentitySqlConfigJudgement {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return { kind: 'invalid', problems: [{ field: 'config', rule: 'must be an object' }] }
  const record = input as Readonly<Record<string, unknown>>
  const problems: ConfigProblem[] = []
  for (const key of Object.keys(record))
    if (!(FIELDS as readonly string[]).includes(key))
      problems.push({ field: key, rule: 'is not a configuration field' })
  const maxLifetime = judgeField(record, 'maxLifetime')
  const idlePeriod = judgeField(record, 'idlePeriod')
  if (!maxLifetime.ok) problems.push(maxLifetime.problem)
  if (!idlePeriod.ok) problems.push(idlePeriod.problem)
  if (!maxLifetime.ok || !idlePeriod.ok || problems.length > 0) return { kind: 'invalid', problems }
  return {
    kind: 'valid',
    config: {
      maxLifetime: record['maxLifetime'] as string,
      idlePeriod: record['idlePeriod'] as string,
    },
    terms: { maxLifetime: maxLifetime.duration, idlePeriod: idlePeriod.duration },
  }
}

/** A terms source that answers the same validated terms at every read. */
export function constantLoginTerms(terms: LoginTerms): LoginTermsSource {
  const reading = Object.freeze({ kind: 'read' as const, terms })
  return Object.freeze({ read: () => Promise.resolve(reading) })
}
