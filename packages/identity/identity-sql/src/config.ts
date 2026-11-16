import type {
  InvitationTerms,
  InvitationTermsSource,
  LoginTerms,
  LoginTermsSource,
} from '@omne-harness/identity'
import { parseDuration, type Duration } from '@omne-harness/utc-instant'
import { compareDurations, isPositive } from './deadline.ts'

export type IdentitySqlConfig = Readonly<{
  maxLifetime: string
  idlePeriod: string
  accessRefreshGranularity: string
  invitationDefaultDuration: string
  invitationMaxDuration: string
}>

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

function unknownFields(record: Readonly<Record<string, unknown>>): ConfigProblem[] {
  return Object.keys(record)
    .filter(key => !(FIELDS as readonly string[]).includes(key))
    .map(key => ({ field: key, rule: 'is not a configuration field' }))
}

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

function refreshOrderProblem(
  durations: Partial<Record<Field, Duration>>,
): ConfigProblem | undefined {
  const { accessRefreshGranularity, idlePeriod } = durations
  if (accessRefreshGranularity === undefined || idlePeriod === undefined) return
  if (compareDurations(accessRefreshGranularity, idlePeriod) < 0) return
  return { field: 'accessRefreshGranularity', rule: 'must be shorter than idlePeriod' }
}

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

export function constantLoginTerms(terms: LoginTerms): LoginTermsSource {
  const reading = Object.freeze({ kind: 'read' as const, terms })
  return Object.freeze({ read: () => Promise.resolve(reading) })
}

export function constantInvitationTerms(terms: InvitationTerms): InvitationTermsSource {
  const reading = Object.freeze({ kind: 'read' as const, terms })
  return Object.freeze({ read: () => Promise.resolve(reading) })
}
