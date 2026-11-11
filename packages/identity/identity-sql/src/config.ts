// The configuration of the `identity` row: two login lifetimes, the access refresh granularity and
// two member invitation durations, all as SI-second text (IC-16, data only). The plugin validates
// it once; the provider reads the resulting terms at every issue. All five fields are required: the
// provider has no duration of its own (identity ID-18), so the deployment writes every value
// (R2-D240).
import type {
  InvitationTerms,
  InvitationTermsSource,
  LoginTerms,
  LoginTermsSource,
} from '@omne-harness/identity'
import { parseDuration, type Duration } from '@omne-harness/utc-instant'
import { compareDurations, isPositive } from './deadline.ts'

/**
 * `PT<seconds>S` text for every duration. Each must be longer than zero, the access refresh
 * granularity must be shorter than the idle period, and the default invitation duration must not
 * be longer than the maximum.
 */
export type IdentitySqlConfig = Readonly<{
  maxLifetime: string
  idlePeriod: string
  /** Access reports within this time of the last refresh commit nothing (SPEC IS-14). */
  accessRefreshGranularity: string
  invitationDefaultDuration: string
  invitationMaxDuration: string
}>

/**
 * The first value of the configuration: logins of 30 days and 7 days idle (DP3-C15), one access
 * refresh commit per login and hour at most, invitations of 7 days by default and 30 days at most
 * (P-10). A deployment that wants these values passes them; the parser never fills a missing field
 * from here.
 */
export const IDENTITY_SQL_DEFAULT_CONFIG: IdentitySqlConfig = Object.freeze({
  maxLifetime: 'PT2592000S',
  idlePeriod: 'PT604800S',
  accessRefreshGranularity: 'PT3600S',
  invitationDefaultDuration: 'PT604800S',
  invitationMaxDuration: 'PT2592000S',
})

export type ConfigProblem = Readonly<{ field: string; rule: string }>

export type IdentitySqlConfigJudgement =
  | Readonly<{
      kind: 'valid'
      config: IdentitySqlConfig
      terms: LoginTerms
      accessRefreshGranularity: Duration
      invitationTerms: InvitationTerms
    }>
  | Readonly<{ kind: 'invalid'; problems: readonly ConfigProblem[] }>

const FIELDS = [
  'maxLifetime',
  'idlePeriod',
  'accessRefreshGranularity',
  'invitationDefaultDuration',
  'invitationMaxDuration',
] as const

type Field = (typeof FIELDS)[number]

type Judged = Readonly<{ ok: true; duration: Duration } | { ok: false; problem: ConfigProblem }>

function judgeField(field: Field, value: unknown): Judged {
  if (typeof value !== 'string')
    return { ok: false, problem: { field, rule: 'must be PT<seconds>S text' } }
  const parsed = parseDuration(value)
  if (!parsed.ok) return { ok: false, problem: { field, rule: 'must be PT<seconds>S text' } }
  if (!isPositive(parsed.value))
    return { ok: false, problem: { field, rule: 'must be longer than zero' } }
  return { ok: true, duration: parsed.value }
}

/** One problem for each key that is not a configuration field. */
function unknownFields(record: Readonly<Record<string, unknown>>): ConfigProblem[] {
  return Object.keys(record)
    .filter(key => !(FIELDS as readonly string[]).includes(key))
    .map(key => ({ field: key, rule: 'is not a configuration field' }))
}

/** The problem of a default invitation duration that is longer than the upper bound, if any. */
function invitationOrderProblem(
  durations: Partial<Record<Field, Duration>>,
): ConfigProblem | undefined {
  const { invitationDefaultDuration, invitationMaxDuration } = durations
  if (invitationDefaultDuration === undefined || invitationMaxDuration === undefined) return
  if (compareDurations(invitationDefaultDuration, invitationMaxDuration) <= 0) return
  return {
    field: 'invitationDefaultDuration',
    rule: 'must not be longer than invitationMaxDuration',
  }
}

/** The problem of a refresh granularity that is not shorter than the idle period, if any. */
function refreshOrderProblem(
  durations: Partial<Record<Field, Duration>>,
): ConfigProblem | undefined {
  const { accessRefreshGranularity, idlePeriod } = durations
  if (accessRefreshGranularity === undefined || idlePeriod === undefined) return
  if (compareDurations(accessRefreshGranularity, idlePeriod) < 0) return
  return { field: 'accessRefreshGranularity', rule: 'must be shorter than idlePeriod' }
}

/**
 * Judges a raw configuration. Lists every problem, not only the first. Unknown fields and missing
 * fields are problems.
 */
export function parseIdentitySqlConfig(input: unknown): IdentitySqlConfigJudgement {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return { kind: 'invalid', problems: [{ field: 'config', rule: 'must be an object' }] }
  const record = input as Readonly<Record<string, unknown>>
  const problems = unknownFields(record)
  const judged = Object.fromEntries(
    FIELDS.map(field => [field, judgeField(field, record[field])]),
  ) as Readonly<Record<Field, Judged>>
  const durations: Partial<Record<Field, Duration>> = {}
  for (const field of FIELDS) {
    const entry = judged[field]
    if (entry.ok) durations[field] = entry.duration
    else problems.push(entry.problem)
  }
  const {
    maxLifetime,
    idlePeriod,
    accessRefreshGranularity,
    invitationDefaultDuration,
    invitationMaxDuration,
  } = durations
  for (const problem of [refreshOrderProblem(durations), invitationOrderProblem(durations)])
    if (problem !== undefined) problems.push(problem)
  if (
    maxLifetime === undefined ||
    idlePeriod === undefined ||
    accessRefreshGranularity === undefined ||
    invitationDefaultDuration === undefined ||
    invitationMaxDuration === undefined ||
    problems.length > 0
  )
    return { kind: 'invalid', problems }
  return {
    kind: 'valid',
    config: {
      maxLifetime: record['maxLifetime'] as string,
      idlePeriod: record['idlePeriod'] as string,
      accessRefreshGranularity: record['accessRefreshGranularity'] as string,
      invitationDefaultDuration: record['invitationDefaultDuration'] as string,
      invitationMaxDuration: record['invitationMaxDuration'] as string,
    },
    terms: { maxLifetime, idlePeriod },
    accessRefreshGranularity,
    invitationTerms: {
      defaultDuration: invitationDefaultDuration,
      maxDuration: invitationMaxDuration,
    },
  }
}

/** A terms source that answers the same validated terms at every read. */
export function constantLoginTerms(terms: LoginTerms): LoginTermsSource {
  const reading = Object.freeze({ kind: 'read' as const, terms })
  return Object.freeze({ read: () => Promise.resolve(reading) })
}

/** An invitation terms source that answers the same validated terms at every read. */
export function constantInvitationTerms(terms: InvitationTerms): InvitationTermsSource {
  const reading = Object.freeze({ kind: 'read' as const, terms })
  return Object.freeze({ read: () => Promise.resolve(reading) })
}
