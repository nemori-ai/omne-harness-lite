// `identity.governance`: the governance reads (SPEC IS-11, IS-13), each in one snapshot. Every query
// except the two pre-reads first checks the initiating login at the call's reading, and an acting
// one also checks that the selection is the acting tenant; a refused read answers `denied` or
// `not-visible` and reads no record of the object. A reading earlier than the issue time of a login
// that the read judges answers `clock-earlier-than-record`, which the provider gives as
// `basis-unavailable` (IS-11). A list is whole or the read fails: a list longer
// than `GOVERNANCE_LIST_LIMIT` fails the read, so the provider answers `basis-unavailable` and
// never a cut list. The pre-reads `account-of` and `login-terms` give the provider the account of an
// identifier and the idle period of a login before a commit; their answers never reach a caller.
import type { JsonValue } from '@omne-harness/sql-contract'
import type { HandlerOutcome, ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  CLOCK_EARLIER_THAN_RECORD,
  GOVERNANCE_LIST_LIMIT,
  HANDLERS,
  MEMBERSHIP_ACTIVE,
  PERSONAL_ORGANIZATION,
  PROTOCOL,
  isRecord,
  isText,
  type GovernanceQuery,
  type GovernanceReadInput,
  type GovernanceReadOutput,
} from './schema.ts'
import {
  actingCaller,
  holdsActiveRole,
  issuedAfterSql,
  liveCaller,
  liveLoginSql,
  loginStandingSql,
  membershipOf,
  nullableText,
  oneRow,
  orderKeySql,
  organizationKind,
  revokedSql,
  rowsOf,
  STANDING,
  text,
  type Row,
} from './support.ts'

type Shape = Readonly<{
  text: readonly string[]
  nullable?: readonly string[]
  choices?: Readonly<Record<string, readonly string[]>>
}>

const CALLER = ['login', 'nowKey']
const ACTING = [...CALLER, 'actingTenant', 'actingOrganization', 'actingAccount']

const SHAPES: Readonly<Record<GovernanceQuery, Shape>> = {
  'create-receipt': { text: [...CALLER, 'createCallId'] },
  invitation: { text: [...ACTING, 'superAdminRole'], nullable: ['invitation'] },
  received: { text: CALLER },
  issued: { text: [...ACTING, 'superAdminRole'] },
  'own-memberships': { text: CALLER },
  members: {
    text: [...ACTING, 'superAdminRole'],
    nullable: ['organization'],
    choices: { wanted: ['active', 'removed', 'invalid'] },
  },
  'current-tenant': { text: CALLER },
  'own-logins': { text: CALLER },
  'account-of': { text: ['loginIdentifier'] },
  'login-terms': { text: CALLER },
}

function isQuery(query: unknown): query is GovernanceQuery {
  return isText(query) && Object.hasOwn(SHAPES, query)
}

function parseInput(raw: unknown): GovernanceReadInput | undefined {
  if (!isRecord(raw) || !isQuery(raw['query'])) return undefined
  const shape = SHAPES[raw['query']]
  const fits =
    shape.text.every(field => isText(raw[field])) &&
    (shape.nullable ?? []).every(field => raw[field] === null || isText(raw[field])) &&
    Object.entries(shape.choices ?? {}).every(
      ([field, allowed]) => isText(raw[field]) && allowed.includes(raw[field]),
    )
  // The shape table has just checked every field this query reads.
  return fits ? (raw as unknown as GovernanceReadInput) : undefined
}

/** A list that would be cut. The read fails instead of answering part of it. */
class ListLimit extends Error {}

/** The rows of one list statement; the statement asks for one row more than the limit. */
function listRows(port: ReadPort, sql: string, params: readonly (string | bigint)[]): Row[] {
  const rows = rowsOf(port, `${sql} LIMIT ${String(GOVERNANCE_LIST_LIMIT + 1)}`, params)
  if (rows.length > GOVERNANCE_LIST_LIMIT) throw new ListLimit()
  return rows
}

const DENIED: GovernanceReadOutput = { outcome: 'denied' }
const NOT_VISIBLE: GovernanceReadOutput = { outcome: 'not-visible' }

function read(fields: Readonly<Record<string, JsonValue>>): GovernanceReadOutput {
  return { outcome: 'read', ...fields }
}

/** An invitation as a reader sees it now: an open one whose expiry is reached reads `expired`. */
const INVITATION_COLUMNS = `invitation, organization, invited_account, expires_at,
  CASE WHEN state = 'open' AND ${orderKeySql('expires_at')} <= ? THEN 'expired' ELSE state END AS state`

function invitationView(row: Row) {
  return {
    invitation: text(row['invitation']),
    state: text(row['state']),
    expiresAt: text(row['expires_at']),
    organization: text(row['organization']),
    invitedAccount: text(row['invited_account']),
  }
}

type Input<Q extends GovernanceQuery> = Extract<GovernanceReadInput, { query: Q }>

function createReceipt(input: Input<'create-receipt'>, port: ReadPort): GovernanceReadOutput {
  const who = liveCaller(port, input.login, input.nowKey)
  if (who.kind !== 'caller') return { outcome: who.outcome }
  const row = oneRow(
    port,
    `SELECT name, governance_model_id, outcome, organization, tenant_text FROM id_create_receipt
      WHERE account = ? AND create_call_id = ? LIMIT 1`,
    [who.account, input.createCallId],
  )
  return read({
    receipt:
      row === undefined
        ? null
        : {
            name: text(row['name']),
            governanceModelId: text(row['governance_model_id']),
            outcome: text(row['outcome']),
            organization: nullableText(row['organization']),
            tenantText: nullableText(row['tenant_text']),
          },
  })
}

function invitation(input: Input<'invitation'>, port: ReadPort): GovernanceReadOutput {
  const who = actingCaller(port, input)
  if (who.kind !== 'caller') return { outcome: who.outcome }
  const row =
    input.invitation === null
      ? undefined
      : oneRow(
          port,
          `SELECT ${INVITATION_COLUMNS} FROM id_invitation WHERE invitation = ? LIMIT 1`,
          [input.nowKey, input.invitation],
        )
  if (row === undefined) return NOT_VISIBLE
  const view = invitationView(row)
  const visible =
    view.invitedAccount === who.account ||
    holdsActiveRole(port, view.organization, who.account, input.superAdminRole)
  return visible ? read({ invitation: view }) : NOT_VISIBLE
}

function received(input: Input<'received'>, port: ReadPort): GovernanceReadOutput {
  const who = liveCaller(port, input.login, input.nowKey)
  if (who.kind !== 'caller') return { outcome: who.outcome }
  const rows = listRows(
    port,
    `SELECT ${INVITATION_COLUMNS} FROM id_invitation WHERE invited_account = ? ORDER BY invitation`,
    [input.nowKey, who.account],
  )
  return read({ invitations: rows.map(invitationView) })
}

function issued(input: Input<'issued'>, port: ReadPort): GovernanceReadOutput {
  const who = actingCaller(port, input)
  if (who.kind !== 'caller') return { outcome: who.outcome }
  const organization = input.actingOrganization
  const kind = organizationKind(port, organization)
  if (kind === undefined || kind === PERSONAL_ORGANIZATION) return DENIED
  if (!holdsActiveRole(port, organization, who.account, input.superAdminRole)) return DENIED
  const rows = listRows(
    port,
    `SELECT ${INVITATION_COLUMNS} FROM id_invitation WHERE organization = ? ORDER BY invitation`,
    [input.nowKey, organization],
  )
  return read({ invitations: rows.map(invitationView) })
}

function ownMemberships(input: Input<'own-memberships'>, port: ReadPort): GovernanceReadOutput {
  const who = liveCaller(port, input.login, input.nowKey)
  if (who.kind !== 'caller') return { outcome: who.outcome }
  const rows = listRows(
    port,
    `SELECT organization, tenant_text, role_model, role_model_revision, role FROM id_membership
      WHERE account = ? AND state = ? ORDER BY organization`,
    [who.account, MEMBERSHIP_ACTIVE],
  )
  return read({
    memberships: rows.map(row => ({
      organization: text(row['organization']),
      tenantText: text(row['tenant_text']),
      roleModel: text(row['role_model']),
      roleModelRevision: text(row['role_model_revision']),
      role: text(row['role']),
    })),
  })
}

function members(input: Input<'members'>, port: ReadPort): GovernanceReadOutput {
  const who = actingCaller(port, input)
  if (who.kind !== 'caller') return { outcome: who.outcome }
  const organization = input.organization
  const own = organization === null ? undefined : membershipOf(port, organization, who.account)
  // A former member sees the organization; an account that never was a member does not.
  if (organization === null || own === undefined) return NOT_VISIBLE
  if (own.state !== MEMBERSHIP_ACTIVE || input.wanted === 'invalid') return DENIED
  if (input.wanted === 'removed' && own.role !== input.superAdminRole) return DENIED
  const rows = listRows(
    port,
    `SELECT account, role_model, role_model_revision, role FROM id_membership
      WHERE organization = ? AND state = ? ORDER BY account`,
    [organization, input.wanted],
  )
  return read({
    members: rows.map(row => ({
      account: text(row['account']),
      roleModel: text(row['role_model']),
      roleModelRevision: text(row['role_model_revision']),
      role: text(row['role']),
    })),
  })
}

function currentTenant(input: Input<'current-tenant'>, port: ReadPort): GovernanceReadOutput {
  const who = liveCaller(port, input.login, input.nowKey)
  return who.kind !== 'caller' ? { outcome: who.outcome } : read({ tenantText: who.selection })
}

function ownLogins(input: Input<'own-logins'>, port: ReadPort): GovernanceReadOutput {
  const who = liveCaller(port, input.login, input.nowKey)
  if (who.kind !== 'caller') return { outcome: who.outcome }
  // A login of the account issued after the reading is not judged, so the list would not be whole.
  const early = oneRow(
    port,
    `SELECT 1 AS early FROM id_login l
      WHERE l.account = ? AND NOT ${revokedSql('l')} AND ${issuedAfterSql('l')} LIMIT 1`,
    [who.account, input.nowKey],
  )
  if (early !== undefined) return { outcome: CLOCK_EARLIER_THAN_RECORD }
  const rows = listRows(
    port,
    `SELECT l.login AS login, l.issued_at AS issued_at, l.max_deadline AS max_deadline,
        l.idle_deadline AS idle_deadline
      FROM id_login l WHERE l.account = ? AND ${liveLoginSql('l')} ORDER BY l.login`,
    [who.account, input.nowKey, input.nowKey, input.nowKey],
  )
  return read({
    logins: rows.map(row => ({
      login: text(row['login']),
      issuedAt: text(row['issued_at']),
      maxDeadline: text(row['max_deadline']),
      idleDeadline: text(row['idle_deadline']),
    })),
  })
}

function accountOf(input: Input<'account-of'>, port: ReadPort): GovernanceReadOutput {
  const row = oneRow(port, 'SELECT account FROM id_account WHERE login_identifier = ? LIMIT 1', [
    input.loginIdentifier,
  ])
  return read({ account: row === undefined ? null : text(row['account']) })
}

function loginTerms(input: Input<'login-terms'>, port: ReadPort): GovernanceReadOutput {
  const row = oneRow(
    port,
    `SELECT l.idle_period AS idle_period, ${loginStandingSql('l')} AS standing
      FROM id_login l WHERE l.login = ? LIMIT 1`,
    [input.nowKey, input.nowKey, input.nowKey, input.login],
  )
  if (row === undefined) return read({ login: null })
  const standing = text(row['standing'])
  if (standing === STANDING.early) return { outcome: CLOCK_EARLIER_THAN_RECORD }
  return read({
    login: { idlePeriod: text(row['idle_period']), live: standing === STANDING.live },
  })
}

function answer(input: GovernanceReadInput, port: ReadPort): GovernanceReadOutput {
  switch (input.query) {
    case 'create-receipt':
      return createReceipt(input, port)
    case 'invitation':
      return invitation(input, port)
    case 'received':
      return received(input, port)
    case 'issued':
      return issued(input, port)
    case 'own-memberships':
      return ownMemberships(input, port)
    case 'members':
      return members(input, port)
    case 'current-tenant':
      return currentTenant(input, port)
    case 'own-logins':
      return ownLogins(input, port)
    case 'account-of':
      return accountOf(input, port)
    case 'login-terms':
      return loginTerms(input, port)
    default: {
      const _exhaustive: never = input
      throw new TypeError(`unknown governance query ${String(_exhaustive)}`)
    }
  }
}

const governanceRead: ReadHandlerModule = {
  handler: HANDLERS.governance,
  protocol: PROTOCOL,
  read(raw, port): HandlerOutcome {
    const input = parseInput(raw)
    if (input === undefined) return { kind: 'failed', diagnostic: 'malformed input' }
    try {
      return { kind: 'read', output: answer(input, port) }
    } catch (error) {
      if (error instanceof ListLimit) return { kind: 'failed', diagnostic: 'list-limit' }
      throw error
    }
  },
}
export default governanceRead
