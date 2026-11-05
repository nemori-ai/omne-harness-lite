import { isDeepStrictEqual } from 'node:util'
import {
  DEFAULT_TEAM_ROLE_MAPPING,
  QUALIFICATIONS,
  isStandingBinding,
  isStandingReservation,
  isQualification,
  standingPrincipalRef,
  standingReservationId,
  type GovernanceOperationRef,
  type GovernanceRecoveryOutcome,
  type IdentityGovernanceRecovery,
  type PrincipalVerifier,
  type StandingDestinationResolver,
  type StandingReservation,
  type StandingReservations,
  type StandingSettleOutcome,
} from '@omne-harness/identity'
import { loginStateCodec, tenantCodec } from '@omne-harness/legal-identity'
import type {
  CommitResultV2,
  JsonValue,
  QueryResultV2,
  ReadResult,
  SqlIdentity,
} from '@omne-harness/sql-contract'
import { encodeInstant } from '@omne-harness/utc-instant'
import { operationKey, sha256Hex } from './identifiers.ts'
import { IDENTITY_DOMAIN, IDENTITY_SCOPE } from './materials.ts'
import {
  IdentitySqlResultUnknown,
  unavailable,
  type TimeBasis,
  type Unavailable,
} from './result.ts'
import {
  CLOCK_EARLIER_THAN_RECORD,
  instantOrderKey,
  isRecord,
  isText,
  type GovernanceFacts,
  type GovernanceReply,
} from './worker/schema.ts'

type Core = Readonly<{
  stopped(): boolean
  readTime(): Promise<TimeBasis>
  commit(facts: Readonly<Record<string, JsonValue>>, identity: SqlIdentity): Promise<CommitResultV2>
  query(identity: SqlIdentity): Promise<QueryResultV2>
  read(input: JsonValue): Promise<ReadResult>
  verifier?: PrincipalVerifier
  resolver?: StandingDestinationResolver
}>

type RecordRow = Readonly<Record<string, JsonValue>>
const identity = (key: string): SqlIdentity => ({
  scope: IDENTITY_SCOPE,
  transactionDomain: IDENTITY_DOMAIN,
  operation: 'identity.coordination',
  protocolVersion: '2',
  operationKey: key,
})
const record = (value: unknown): value is RecordRow => isRecord(value)
const serialized = (reservation: StandingReservation) => ({
  binding: JSON.stringify(reservation.binding),
  required: JSON.stringify([...new Set(reservation.required)].sort()),
})
function decodeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
const pageLimit = (value: number | undefined) =>
  value === undefined
    ? 32
    : Number.isInteger(value) && value >= 1 && value <= 100
      ? value
      : undefined

function reservationOf(row: RecordRow): StandingReservation | undefined {
  if (!isText(row['reservation_id']) || !isText(row['binding']) || !isText(row['required']))
    return undefined
  const candidate: unknown = {
    id: row['reservation_id'],
    binding: decodeJson(row['binding']),
    required: decodeJson(row['required']),
  }
  return isStandingReservation(candidate) ? candidate : undefined
}

function finalOutcome(
  reply: GovernanceReply,
): Extract<GovernanceRecoveryOutcome, { kind: 'finished' }>['outcome'] {
  if (
    reply.outcome === 'succeeded' &&
    isText(reply['invitation']) &&
    ['accepted', 'rejected', 'withdrawn', 'expired'].includes(reply['state'] ?? '')
  )
    return {
      kind: 'succeeded',
      invitation: reply['invitation'],
      state: reply['state'] as 'accepted' | 'rejected' | 'withdrawn' | 'expired',
    }
  if (
    reply.outcome === 'no-change' &&
    isText(reply['invitation']) &&
    ['accepted', 'rejected', 'withdrawn', 'expired'].includes(reply['state'] ?? '')
  )
    return {
      kind: 'no-change',
      invitation: reply['invitation'],
      state: reply['state'] as 'accepted' | 'rejected' | 'withdrawn' | 'expired',
    }
  if (reply.outcome === 'succeeded') return { kind: 'succeeded' }
  if (reply.outcome === 'denied') return { kind: 'denied' }
  if (reply.outcome === 'not-visible') return { kind: 'not-visible' }
  if (reply.outcome === 'conflict') return { kind: 'conflict' }
  return unavailable(
    reply.outcome === CLOCK_EARLIER_THAN_RECORD
      ? CLOCK_EARLIER_THAN_RECORD
      : 'governance-result-malformed',
  )
}

function replyFromRow(row: RecordRow): GovernanceReply | undefined {
  if (row['state'] !== 'finished' || !isText(row['response'])) return undefined
  const response = decodeJson(row['response'])
  return isRecord(response) && isText(response['outcome']) && Object.values(response).every(isText)
    ? (response as GovernanceReply)
    : undefined
}

export function coordinationOver(core: Core) {
  const read = async (input: JsonValue): Promise<RecordRow | undefined> => {
    try {
      const result = await core.read(input)
      return result.kind === 'read' && record(result.output) ? result.output : undefined
    } catch {
      return undefined
    }
  }
  const row = async (input: JsonValue): Promise<RecordRow | undefined> => {
    const result = await read(input)
    return result !== undefined && record(result['row']) ? result['row'] : undefined
  }
  const query = async (id: SqlIdentity): Promise<QueryResultV2> => {
    try {
      return await core.query(id)
    } catch {
      return { kind: 'unknown', identity: id, diagnostic: 'query-unavailable' }
    }
  }
  const run = async (
    facts: Readonly<Record<string, JsonValue>>,
    key = operationKey(),
    operation?: GovernanceOperationRef,
  ): Promise<GovernanceReply | undefined> => {
    const id = identity(key)
    let result: CommitResultV2 | QueryResultV2
    try {
      result = await core.commit(facts, id)
    } catch {
      result = { kind: 'unknown', identity: id, diagnostic: 'commit-unavailable' }
    }
    for (let attempt = 0; result.kind === 'unknown' && attempt < 3; attempt += 1)
      result = await query(id)
    if (
      operation !== undefined &&
      (result.kind === 'unknown' || result.kind === 'identity_conflict')
    )
      throw new IdentitySqlResultUnknown('membership phase result unknown', operation)
    if (result.kind !== 'committed') return undefined
    const response = result.responses[0]?.reply
    if (response?.kind !== 'participated' || !isRecord(response.response)) {
      if (operation !== undefined)
        throw new IdentitySqlResultUnknown('membership phase reply malformed', operation)
      return undefined
    }
    const value = response.response
    if (isText(value['outcome']) && Object.values(value).every(isText))
      return value as GovernanceReply
    if (operation !== undefined)
      throw new IdentitySqlResultUnknown('membership phase reply malformed', operation)
    return undefined
  }
  const terminal = (reservation: StandingReservation, outcome: unknown): StandingSettleOutcome =>
    outcome === 'committed' || outcome === 'aborted'
      ? { kind: 'terminal', reservation, outcome }
      : { kind: 'unavailable', diagnostic: 'terminal-malformed' }

  const settle: StandingReservations['settle'] = async id => {
    if (core.stopped()) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    if (typeof id !== 'string' || id.length > 128) return { kind: 'not-found' }
    const found = await read({ query: 'reservation', id })
    if (found === undefined) return { kind: 'unavailable', diagnostic: 'reservation-unavailable' }
    if (found['row'] === null) return { kind: 'not-found' }
    if (!record(found['row'])) return { kind: 'unavailable', diagnostic: 'reservation-malformed' }
    const saved = found['row']
    const reservation = reservationOf(saved)
    if (reservation === undefined)
      return { kind: 'unavailable', diagnostic: 'reservation-malformed' }
    if (saved['state'] === 'settled') return terminal(reservation, saved['terminal'])
    if (core.resolver === undefined)
      return { kind: 'unavailable', diagnostic: 'destination-resolver-missing' }
    let proof: unknown
    try {
      proof = await core.resolver.seal(reservation)
    } catch {
      return { kind: 'unavailable', diagnostic: 'destination-unavailable' }
    }
    if (
      !isRecord(proof) ||
      proof['kind'] !== 'terminal' ||
      !isStandingReservation(proof['reservation']) ||
      proof['reservation'].id !== reservation.id ||
      !isDeepStrictEqual(proof['reservation'].binding, reservation.binding) ||
      (proof['outcome'] !== 'committed' && proof['outcome'] !== 'aborted')
    )
      return { kind: 'unavailable', diagnostic: 'destination-terminal-unverified' }
    const result = await run(
      { kind: 'standing-finish', id, ...serialized(reservation), terminal: proof['outcome'] },
      `${id}/finish`,
    )
    return result?.outcome === 'settled'
      ? terminal(reservation, result['terminal'])
      : { kind: 'unavailable', diagnostic: 'settlement-unknown' }
  }

  const reserve: StandingReservations['reserve'] = async input => {
    if (core.stopped()) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    if (
      !isRecord(input) ||
      !isStandingBinding(input.binding) ||
      !Array.isArray(input.required) ||
      input.required.length > 16 ||
      !input.required.every(isQualification) ||
      core.verifier === undefined
    )
      return { kind: 'denied' }
    const binding = Object.freeze({
      version: input.binding.version,
      owner: input.binding.owner,
      operationId: input.binding.operationId,
      principalRef: input.binding.principalRef,
      destination: input.binding.destination,
      scopeRef: input.binding.scopeRef,
      targetRef: input.binding.targetRef,
      inputDigest: input.binding.inputDigest,
    })
    const required = Object.freeze([...new Set(input.required)].sort())
    let verified
    try {
      verified = await core.verifier.verify(input.principal)
    } catch {
      return { kind: 'unavailable', diagnostic: 'principal-verifier-unavailable' }
    }
    if (verified.kind === 'unavailable')
      return { kind: 'unavailable', diagnostic: 'principal-verifier-unavailable' }
    if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
      return { kind: 'denied' }
    const principal = verified.principal
    const tenantText = tenantCodec.encode(principal.tenant)
    if (
      !tenantText.ok ||
      binding.scopeRef !== tenantText.value ||
      binding.principalRef !== standingPrincipalRef(principal)
    )
      return { kind: 'denied' }
    const reservation: StandingReservation = Object.freeze({
      id: standingReservationId(binding, required),
      binding,
      required,
    })
    const result = await run({
      kind: 'standing-reserve',
      id: reservation.id,
      operationRef: sha256Hex(
        JSON.stringify([
          binding.owner,
          binding.scopeRef,
          binding.targetRef,
          binding.principalRef,
          binding.operationId,
        ]),
      ),
      ...serialized(reservation),
      roleModel: DEFAULT_TEAM_ROLE_MAPPING.model.model,
      roleModelRevision: DEFAULT_TEAM_ROLE_MAPPING.model.revision,
      knownQualifications: JSON.stringify(QUALIFICATIONS),
      knownRoles: JSON.stringify(DEFAULT_TEAM_ROLE_MAPPING.roles.map(entry => entry.role)),
      qualifiedRoles: JSON.stringify(
        DEFAULT_TEAM_ROLE_MAPPING.roles
          .filter(entry =>
            required.every(qualification => entry.qualifications.includes(qualification)),
          )
          .map(entry => entry.role),
      ),
      tenantText: tenantText.value,
      organization: principal.tenant.organization.text,
      account: principal.tenant.account.text,
    })
    if (result?.outcome === 'held') return { kind: 'held', reservation }
    if (result?.outcome === 'settled') {
      const settled = terminal(reservation, result['terminal'])
      return settled.kind === 'not-found'
        ? { kind: 'unavailable', diagnostic: 'reservation-malformed' }
        : settled
    }
    if (
      result?.outcome === 'denied' ||
      result?.outcome === 'operation-conflict' ||
      result?.outcome === 'blocked'
    )
      return { kind: result.outcome }
    return { kind: 'unavailable', diagnostic: 'reservation-unknown' }
  }

  const recoverReservations: StandingReservations['recover'] = async (input = {}) => {
    if (core.stopped()) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    if (!isRecord(input)) return { kind: 'unavailable', diagnostic: 'page-invalid' }
    const limit = pageLimit(input.limit)
    if (limit === undefined || (input.after !== undefined && typeof input.after !== 'string'))
      return { kind: 'unavailable', diagnostic: 'page-invalid' }
    const found = await read({ query: 'reservations', after: input.after ?? '', limit })
    if (found === undefined || !Array.isArray(found['rows']))
      return { kind: 'unavailable', diagnostic: 'reservations-unavailable' }
    let settled = 0
    let next: string | null = null
    for (const candidate of found['rows']) {
      if (!record(candidate) || !isText(candidate['reservation_id']))
        return { kind: 'unavailable', diagnostic: 'reservation-malformed' }
      next = candidate['reservation_id']
      if ((await settle(next)).kind === 'terminal') settled += 1
    }
    return {
      kind: 'recovered',
      examined: found['rows'].length,
      settled,
      next: found['more'] === true ? next : null,
    }
  }

  const continueIntent = async (saved: RecordRow): Promise<GovernanceReply | undefined> => {
    const finished = replyFromRow(saved)
    if (finished !== undefined) return finished
    if (
      !isText(saved['operation_id']) ||
      !isText(saved['attempt']) ||
      !isText(saved['organization']) ||
      !isText(saved['account'])
    )
      return undefined
    const operationId = saved['operation_id']
    const pending = await read({
      query: 'reservations',
      after: '',
      limit: 100,
      organization: saved['organization'],
      account: saved['account'],
    })
    if (pending === undefined || !Array.isArray(pending['rows'])) return undefined
    for (const candidate of pending['rows']) {
      if (
        !record(candidate) ||
        !isText(candidate['reservation_id']) ||
        (await settle(candidate['reservation_id'])).kind !== 'terminal'
      )
        return undefined
    }
    if (saved['attempt'] !== '0') {
      const prior = await query(identity(`${operationId}/apply/${saved['attempt']}`))
      if (prior.kind === 'unknown') return undefined
      if (prior.kind === 'committed') {
        const current = await row({ query: 'intent', operationId })
        if (current !== undefined && current['state'] === 'finished') return replyFromRow(current)
      }
    }
    const time = await core.readTime()
    if (time.kind !== 'read') return undefined
    const nowKey = instantOrderKey(encodeInstant(time.instant))
    const prepared = await run({
      kind: 'membership-prepare',
      operationId,
      expectedAttempt: saved['attempt'],
      nowKey,
    })
    if (prepared?.outcome === 'finished') {
      const current = await row({ query: 'intent', operationId })
      return current === undefined ? undefined : replyFromRow(current)
    }
    if (prepared?.outcome !== 'prepared' || !isText(prepared['attempt'])) return undefined
    await run(
      { kind: 'membership-apply', operationId, attempt: prepared['attempt'], nowKey },
      `${operationId}/apply/${prepared['attempt']}`,
    )
    const current = await row({ query: 'intent', operationId })
    return current === undefined ? undefined : replyFromRow(current)
  }

  const writeMembership = async (
    facts: GovernanceFacts,
  ): Promise<GovernanceReply | Unavailable> => {
    const operation: GovernanceOperationRef = { operationId: `membership/${operationKey()}` }
    const result = await run(
      {
        kind: 'membership-admit',
        operationId: operation.operationId,
        facts: JSON.stringify(facts),
      },
      `${operation.operationId}/admit`,
      operation,
    )
    const saved = await row({ query: 'intent', operationId: operation.operationId })
    if (saved === undefined) {
      if (result === undefined) return unavailable('governance-store-unavailable')
      throw new IdentitySqlResultUnknown('membership admission result unknown', operation)
    }
    const reply = await continueIntent(saved)
    if (reply === undefined)
      throw new IdentitySqlResultUnknown('membership change pending', operation)
    return reply
  }

  const resume: IdentityGovernanceRecovery['resume'] = async request => {
    if (core.stopped()) return unavailable('provider-stopped')
    const login = loginStateCodec.encode(request?.login)
    if (
      !login.ok ||
      !isRecord(request?.operation) ||
      !isText(request.operation.operationId) ||
      request.operation.operationId.length > 128
    )
      return { kind: 'denied' }
    const time = await core.readTime()
    if (time.kind !== 'read') return time
    const found = await read({
      query: 'intent',
      operationId: request.operation.operationId,
      login: login.value,
      nowKey: instantOrderKey(encodeInstant(time.instant)),
    })
    if (found === undefined) return unavailable('governance-recovery-unavailable')
    if (found['outcome'] === 'denied' || found['outcome'] === 'not-visible')
      return { kind: found['outcome'] }
    if (found['outcome'] === CLOCK_EARLIER_THAN_RECORD)
      return unavailable(CLOCK_EARLIER_THAN_RECORD)
    if (!record(found['row'])) return { kind: 'not-visible' }
    const reply = await continueIntent(found['row'])
    return reply === undefined
      ? { kind: 'pending', operation: request.operation }
      : { kind: 'finished', operation: request.operation, outcome: finalOutcome(reply) }
  }

  const recoverIntents: IdentityGovernanceRecovery['recover'] = async (input = {}) => {
    if (core.stopped()) return unavailable('provider-stopped')
    if (!isRecord(input) || (input.after !== undefined && typeof input.after !== 'string'))
      return unavailable('page-invalid')
    const limit = pageLimit(input.limit)
    if (limit === undefined) return unavailable('page-invalid')
    const found = await read({ query: 'intents', after: input.after ?? '', limit })
    if (found === undefined || !Array.isArray(found['rows']))
      return unavailable('governance-recovery-unavailable')
    let finished = 0
    let next: string | null = null
    for (const candidate of found['rows']) {
      if (!record(candidate) || !isText(candidate['operation_id']))
        return unavailable('intent-malformed')
      next = candidate['operation_id']
      if ((await continueIntent(candidate)) !== undefined) finished += 1
    }
    return {
      kind: 'recovered',
      examined: found['rows'].length,
      finished,
      next: found['more'] === true ? next : null,
    }
  }

  return {
    reservations: Object.freeze({
      reserve,
      settle,
      recover: recoverReservations,
    }) satisfies StandingReservations,
    governanceRecovery: Object.freeze({
      resume,
      recover: recoverIntents,
    }) satisfies IdentityGovernanceRecovery,
    writeMembership,
  }
}
