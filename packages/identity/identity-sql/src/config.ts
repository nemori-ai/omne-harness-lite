// The configuration of the `identity` row: two login lifetimes and two member invitation durations,
// all as SI-second text (IC-16, data only). The plugin validates it once; the provider reads the
// resulting terms at every issue. The invitation durations may be left out: the schema then uses
// their initial values (P-10, R2-D204: 7 days and 30 days). The deployment writes its own values.
import type {
  InvitationTerms,
  InvitationTermsSource,
  LoginTerms,
  LoginTermsSource,
} from '@omne-harness/identity'
import { parseDuration, type Duration } from '@omne-harness/utc-instant'
import { compareDurations, isPositive } from './deadline.ts'

/**
 * `PT<seconds>S` text for every duration. Each must be longer than zero, and the default invitation
 * duration must not be longer than the maximum. The two invitation fields are optional on input;
 * a valid configuration always has them.
 */
export type IdentitySqlConfig = Readonly<{
  maxLifetime: string
  idlePeriod: string
  invitationDefaultDuration?: string
  invitationMaxDuration?: string
}>

/** The initial values of the two invitation durations: 7 days and 30 days (P-10, R2-D204). */
export const IDENTITY_SQL_INVITATION_DEFAULTS = Object.freeze({
  invitationDefaultDuration: 'PT604800S',
  invitationMaxDuration: 'PT2592000S',
})

/**
 * The first value of the configuration: logins of 30 days and 7 days idle (DP3-C15), invitations
 * of 7 days by default and 30 days at most (P-10).
 */
export const IDENTITY_SQL_DEFAULT_CONFIG: Required<IdentitySqlConfig> = Object.freeze({
  maxLifetime: 'PT2592000S',
  idlePeriod: 'PT604800S',
  ...IDENTITY_SQL_INVITATION_DEFAULTS,
})

export type ConfigProblem = Readonly<{ field: string; rule: string }>

export type IdentitySqlConfigJudgement =
  | Readonly<{
      kind: 'valid'
      config: Required<IdentitySqlConfig>
      terms: LoginTerms
      invitationTerms: InvitationTerms
    }>
  | Readonly<{ kind: 'invalid'; problems: readonly ConfigProblem[] }>

const FIELDS = [
  'maxLifetime',
  'idlePeriod',
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

/**
 * Judges a raw configuration. Lists every problem, not only the first. Unknown fields are problems.
 * An absent invitation duration takes its initial value.
 */
export function parseIdentitySqlConfig(input: unknown): IdentitySqlConfigJudgement {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return { kind: 'invalid', problems: [{ field: 'config', rule: 'must be an object' }] }
  const record = input as Readonly<Record<string, unknown>>
  const problems: ConfigProblem[] = []
  for (const key of Object.keys(record))
    if (!(FIELDS as readonly string[]).includes(key))
      problems.push({ field: key, rule: 'is not a configuration field' })
  const filled: Readonly<Record<Field, unknown>> = {
    maxLifetime: record['maxLifetime'],
    idlePeriod: record['idlePeriod'],
    invitationDefaultDuration:
      record['invitationDefaultDuration'] ??
      IDENTITY_SQL_INVITATION_DEFAULTS.invitationDefaultDuration,
    invitationMaxDuration:
      record['invitationMaxDuration'] ?? IDENTITY_SQL_INVITATION_DEFAULTS.invitationMaxDuration,
  }
  const judged = Object.fromEntries(
    FIELDS.map(field => [field, judgeField(field, filled[field])]),
  ) as Readonly<Record<Field, Judged>>
  const durations: Partial<Record<Field, Duration>> = {}
  for (const field of FIELDS) {
    const entry = judged[field]
    if (entry.ok) durations[field] = entry.duration
    else problems.push(entry.problem)
  }
  const { maxLifetime, idlePeriod, invitationDefaultDuration, invitationMaxDuration } = durations
  if (
    invitationDefaultDuration !== undefined &&
    invitationMaxDuration !== undefined &&
    compareDurations(invitationDefaultDuration, invitationMaxDuration) > 0
  )
    problems.push({
      field: 'invitationDefaultDuration',
      rule: 'must not be longer than invitationMaxDuration',
    })
  if (
    maxLifetime === undefined ||
    idlePeriod === undefined ||
    invitationDefaultDuration === undefined ||
    invitationMaxDuration === undefined ||
    problems.length > 0
  )
    return { kind: 'invalid', problems }
  return {
    kind: 'valid',
    config: {
      maxLifetime: filled.maxLifetime as string,
      idlePeriod: filled.idlePeriod as string,
      invitationDefaultDuration: filled.invitationDefaultDuration as string,
      invitationMaxDuration: filled.invitationMaxDuration as string,
    },
    terms: { maxLifetime, idlePeriod },
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
