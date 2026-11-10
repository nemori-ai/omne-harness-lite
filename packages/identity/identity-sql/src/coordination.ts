import { isDeepStrictEqual } from 'node:util'
import {
  DEFAULT_TEAM_ROLE_MAPPING,
  QUALIFICATIONS,
  isStandingBinding,
  isStandingReservation,
  isQualification,
  standingPrincipalRef,
  standingReservationId,
  type ActingForTenantPrincipal,
  type StandingBinding,
  type GovernanceOperationRef,
  type GovernanceRecoveryOutcome,
  type IdentityGovernanceRecovery,
  type PrincipalVerifier,
  type StandingDestinationResolver,
  type StandingReservation,
  type StandingReservations,
  type StandingSettleOutcome,
  type StandingReserveOutcome,
} from '@omne-harness/identity'
import { loginStateCodec, tenantCodec } from '@omne-harness/legal-identity'
import type {
  CommittedV2,
  CommitResultV2,
  JsonValue,
  QueryResultV2,
  ReadResult,
  SqlIdentity,
} from '@omne-harness/sql-contract'
import { encodeInstant } from '@omne-harness/utc-instant'
import { operationKey } from './identifiers.ts'
import {
  requestReservation,
  reservationOperationRef,
  reservationTenant,
} from './standing-request.ts'
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
const pageLimit = (value: unknown) =>
  value === undefined
    ? 32
    : typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100
      ? value
      : undefined

function recoveryPage(input: unknown): { after: string; limit: number } | undefined {
  if (!isRecord(input)) return undefined
  const limit = pageLimit(input['limit'])
  if (limit === undefined || (input['after'] !== undefined && typeof input['after'] !== 'string'))
    return undefined
  return { after: input['after'] ?? '', limit }
}

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

function phaseReply(result: CommittedV2): GovernanceReply | undefined {
  const response = result.responses[0]?.reply
  if (response?.kind !== 'participated' || !isRecord(response.response)) return undefined
  const value = response.response
  return isText(value['outcome']) && Object.values(value).every(isText)
    ? (value as GovernanceReply)
    : undefined
}

async function reservationPrincipal(
  verifier: PrincipalVerifier,
  value: unknown,
  binding: StandingBinding,
): Promise<
  | { kind: 'verified'; principal: ActingForTenantPrincipal; tenantText: string }
  | { kind: 'denied' }
  | { kind: 'unavailable'; diagnostic: string }
> {
  let verified
  try {
    verified = await verifier.verify(value)
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
  return { kind: 'verified', principal, tenantText: tenantText.value }
}

const terminal = (
  reservation: StandingReservation,
  outcome: unknown,
): Exclude<StandingSettleOutcome, { kind: 'operation-conflict' }> =>
  outcome === 'committed' || outcome === 'aborted'
    ? { kind: 'terminal', reservation, outcome }
    : { kind: 'unavailable', diagnostic: 'terminal-malformed' }

function reserveOutcome(
  result: GovernanceReply | undefined,
  reservation: StandingReservation,
): StandingReserveOutcome {
  if (result?.outcome === 'held') return { kind: 'held', reservation }
  if (result?.outcome === 'settled') return terminal(reservation, result['terminal'])
  if (
    result?.outcome === 'denied' ||
    result?.outcome === 'operation-conflict' ||
    result?.outcome === 'blocked'
  )
    return { kind: result.outcome }
  return { kind: 'unavailable', diagnostic: 'reservation-unknown' }
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
    const reply = phaseReply(result)
    if (reply !== undefined) return reply
    if (operation !== undefined)
      throw new IdentitySqlResultUnknown('membership phase reply malformed', operation)
    return undefined
  }
  async function sealReservation(
    reservation: StandingReservation,
  ): Promise<
    | { kind: 'terminal'; outcome: 'committed' | 'aborted' }
    | { kind: 'unavailable'; diagnostic: string }
  > {
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
    return { kind: 'terminal', outcome: proof['outcome'] }
  }

  const settlementRecord = async (reservation: StandingReservation) => {
    const found = await read({
      query: 'reservation-operation',
      operationRef: reservationOperationRef(reservation),
    })
    if (found === undefined)
      return { kind: 'unavailable', diagnostic: 'reservation-unavailable' } as const
    if (found['row'] === null) return { kind: 'absent' } as const
    if (!record(found['row']))
      return { kind: 'unavailable', diagnostic: 'reservation-malformed' } as const
    const saved = found['row']
    const original = reservationOf(saved)
    if (original === undefined)
      return { kind: 'unavailable', diagnostic: 'reservation-malformed' } as const
    if (
      original.id !== reservation.id ||
      !isDeepStrictEqual(original.binding, reservation.binding) ||
      !isDeepStrictEqual([...new Set(original.required)].sort(), reservation.required)
    )
      return { kind: 'operation-conflict' } as const
    if (saved['state'] === 'settled') return terminal(original, saved['terminal'])
    return saved['state'] === 'held'
      ? ({ kind: 'held' } as const)
      : ({ kind: 'unavailable', diagnostic: 'reservation-malformed' } as const)
  }

  async function settlementProof(
    reservation: StandingReservation,
  ): Promise<
    StandingSettleOutcome | Readonly<{ kind: 'ready'; outcome: 'aborted' | 'committed' }>
  > {
    const found = await settlementRecord(reservation)
    if (found.kind !== 'absent' && found.kind !== 'held') return found
    const proof = await sealReservation(reservation)
    if (proof.kind !== 'terminal') return proof
    if (found.kind === 'absent' && proof.outcome === 'committed') {
      const current = await settlementRecord(reservation)
      if (current.kind === 'absent')
        return { kind: 'unavailable', diagnostic: 'committed-reservation-missing' }
      if (current.kind !== 'held') return current
    }
    return { kind: 'ready', outcome: proof.outcome } as const
  }

  const observe: StandingReservations['observe'] = async request => {
    if (core.stopped()) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    const reservation = requestReservation(request)
    if (reservation === undefined) return { kind: 'unavailable', diagnostic: 'request-invalid' }
    if (reservationTenant(reservation) === undefined)
      return { kind: 'unavailable', diagnostic: 'request-tenant-invalid' }
    const found = await settlementRecord(reservation)
    if (found.kind === 'absent') return { kind: 'not_found' }
    if (found.kind === 'held') return { kind: 'held', reservation }
    return found
  }

  const settle: StandingReservations['settle'] = async request => {
    if (core.stopped()) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    const reservation = requestReservation(request)
    if (reservation === undefined) return { kind: 'unavailable', diagnostic: 'request-invalid' }
    const tenant = reservationTenant(reservation)
    if (tenant === undefined) return { kind: 'unavailable', diagnostic: 'request-tenant-invalid' }
    const proof = await settlementProof(reservation)
    if (proof.kind !== 'ready') return proof
    const result = await run(
      {
        kind: 'standing-settle-request',
        id: reservation.id,
        operationRef: reservationOperationRef(reservation),
        ...serialized(reservation),
        organization: tenant.organization.text,
        account: tenant.account.text,
        terminal: proof.outcome,
      },
      `${reservation.id}/settle-request/1`,
    )
    if (result?.outcome === 'operation-conflict') return { kind: 'operation-conflict' }
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
    const verified = await reservationPrincipal(core.verifier, input.principal, binding)
    if (verified.kind !== 'verified') return verified
    const { principal, tenantText } = verified
    const reservation: StandingReservation = Object.freeze({
      id: standingReservationId(binding, required),
      binding,
      required,
    })
    const result = await run({
      kind: 'standing-reserve',
      id: reservation.id,
      operationRef: reservationOperationRef(reservation),
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
      tenantText,
      organization: principal.tenant.organization.text,
      account: principal.tenant.account.text,
    })
    return reserveOutcome(result, reservation)
  }

  const recoverReservations: StandingReservations['recover'] = async (input = {}) => {
    if (core.stopped()) return { kind: 'unavailable', diagnostic: 'provider-stopped' }
    const page = recoveryPage(input)
    if (page === undefined) return { kind: 'unavailable', diagnostic: 'page-invalid' }
    const found = await read({ query: 'reservations', ...page })
    if (found === undefined || !Array.isArray(found['rows']))
      return { kind: 'unavailable', diagnostic: 'reservations-unavailable' }
    let settled = 0
    let next: string | null = null
    for (const candidate of found['rows']) {
      const reservation = record(candidate) ? reservationOf(candidate) : undefined
      if (reservation === undefined)
        return { kind: 'unavailable', diagnostic: 'reservation-malformed' }
      next = reservation.id
      if ((await settle(reservation)).kind === 'terminal') settled += 1
    }
    return {
      kind: 'recovered',
      examined: found['rows'].length,
      settled,
      next: found['more'] === true ? next : null,
    }
  }

  const drainReservations = async (organization: string, account: string): Promise<boolean> => {
    const pending = await read({
      query: 'reservations',
      after: '',
      limit: 100,
      organization,
      account,
    })
    if (pending === undefined || !Array.isArray(pending['rows'])) return false
    for (const candidate of pending['rows']) {
      const reservation = record(candidate) ? reservationOf(candidate) : undefined
      if (reservation === undefined || (await settle(reservation)).kind !== 'terminal') return false
    }
    return true
  }

  const applyAttempt = async (
    operationId: string,
    expectedAttempt: string,
  ): Promise<GovernanceReply | undefined> => {
    const time = await core.readTime()
    if (time.kind !== 'read') return undefined
    const nowKey = instantOrderKey(encodeInstant(time.instant))
    const prepared = await run({
      kind: 'membership-prepare',
      operationId,
      expectedAttempt,
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
    if (!(await drainReservations(saved['organization'], saved['account']))) return undefined
    if (saved['attempt'] !== '0') {
      const prior = await query(identity(`${operationId}/apply/${saved['attempt']}`))
      if (prior.kind === 'unknown') return undefined
      if (prior.kind === 'committed') {
        const current = await row({ query: 'intent', operationId })
        if (current !== undefined && current['state'] === 'finished') return replyFromRow(current)
      }
    }
    return applyAttempt(operationId, saved['attempt'])
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
    const page = recoveryPage(input)
    if (page === undefined) return unavailable('page-invalid')
    const found = await read({ query: 'intents', ...page })
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
      observe,
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
