// Shared by the Worker modules: row access over the statement ports, the read handler frame that
// checks its input once at the boundary, and the SQL of the checks that the participant and the
// governance read both make: the order key of an instant, a valid login, a membership and an
// organization kind. No runtime import beyond this directory.
import type { JsonValue } from '@omne-harness/sql-contract'
import type {
  HandlerOutcome,
  ReadHandlerModule,
  ReadPort,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import { CLOCK_EARLIER_THAN_RECORD, MEMBERSHIP_ACTIVE, PROTOCOL } from './schema.ts'

export type Row = Readonly<Record<string, SqlCell>>

export type Executor = Readonly<{
  execute(
    sql: string,
    params: readonly SqlValue[],
  ): Readonly<{ columns: readonly string[]; rows: readonly (readonly SqlCell[])[] }>
}>

export function rowsOf(port: Executor, sql: string, params: readonly SqlValue[]): Row[] {
  const result = port.execute(sql, params)
  return result.rows.map(cells =>
    Object.fromEntries(result.columns.map((name, index) => [name, cells[index] ?? null])),
  )
}

export function oneRow(port: Executor, sql: string, params: readonly SqlValue[]): Row | undefined {
  return rowsOf(port, sql, params)[0]
}

export const text = (cell: SqlCell | undefined): string => String(cell)

/** A text cell, or `null` for a NULL cell. */
export const nullableText = (cell: SqlCell | undefined): string | null =>
  cell === null || cell === undefined ? null : String(cell)

/** True for the integer 1 that SQLite gives a true comparison. */
export const isTrue = (cell: SqlCell | undefined): boolean => cell === 1n || cell === 1

/**
 * The order key of an encoded instant column, in SQL: the same key as `instantOrderKey` in
 * `schema.ts`. Only functions of the base allow list (substr, rtrim, iif, length).
 */
export function orderKeySql(column: string): string {
  return `(substr(${column}, 1, 19) || '.' || rtrim(iif(substr(${column}, 20, 1) = '.', substr(${column}, 21, length(${column}) - 21), ''), '0'))`
}

/** The condition that the login row `alias` has a revocation row. */
export function revokedSql(alias: string): string {
  return `EXISTS (SELECT 1 FROM id_login_revocation r WHERE r.login = ${alias}.login)`
}

/**
 * The condition that the reading with order key `?` is earlier than the issue time of the login
 * row `alias`: the lower bound of recognition (IS-05 step 5). It takes the reading's key once.
 */
export function issuedAfterSql(alias: string): string {
  return `${orderKeySql(`${alias}.issued_at`)} > ?`
}

/** The condition that the reading `?`, `?` is not earlier than one of the two deadlines. */
function endedSql(alias: string): string {
  return `(${orderKeySql(`${alias}.max_deadline`)} <= ? OR ${orderKeySql(`${alias}.idle_deadline`)} <= ?)`
}

/**
 * The condition that the login row `alias` is valid at the reading with order key `?`: not
 * revoked, issued no later than the reading, and the reading earlier than both deadlines. It takes
 * the reading's key three times.
 */
export function liveLoginSql(alias: string): string {
  return `NOT ${revokedSql(alias)} AND NOT ${issuedAfterSql(alias)} AND NOT ${endedSql(alias)}`
}

/** The standing of a login at one reading, judged in the order of recognition (IS-05 steps 4 to 6). */
export const STANDING = Object.freeze({
  revoked: 'revoked',
  early: 'early',
  ended: 'ended',
  live: 'live',
})

/**
 * The standing of the login row `alias` at the reading with order key `?`, as one of the texts of
 * `STANDING`: a revocation first, then a reading earlier than the issue time, then the deadlines.
 * It takes the reading's key three times.
 */
export function loginStandingSql(alias: string): string {
  return `CASE WHEN ${revokedSql(alias)} THEN '${STANDING.revoked}'
    WHEN ${issuedAfterSql(alias)} THEN '${STANDING.early}'
    WHEN ${endedSql(alias)} THEN '${STANDING.ended}' ELSE '${STANDING.live}' END`
}

/** A valid initiating login: its account and its current selection. */
export type Caller = Readonly<{ kind: 'caller'; account: string; selection: string }>

/**
 * A refused initiating login. `denied`: unknown, revoked, ended, or not the acting tenant.
 * `CLOCK_EARLIER_THAN_RECORD`: the reading is earlier than its issue time, so it is not judged.
 */
export type Refusal = Readonly<{
  kind: 'refused'
  outcome: 'denied' | typeof CLOCK_EARLIER_THAN_RECORD
}>

const REFUSED_DENIED: Refusal = Object.freeze({ kind: 'refused', outcome: 'denied' })
const REFUSED_EARLY: Refusal = Object.freeze({
  kind: 'refused',
  outcome: CLOCK_EARLIER_THAN_RECORD,
})

/** The initiating login when it is valid at `nowKey`, or why it is refused. */
export function liveCaller(port: Executor, login: string, nowKey: string): Caller | Refusal {
  const row = oneRow(
    port,
    `SELECT l.account AS account, l.tenant_text AS selection, ${loginStandingSql('l')} AS standing
      FROM id_login l WHERE l.login = ? LIMIT 1`,
    [nowKey, nowKey, nowKey, login],
  )
  if (row === undefined) return REFUSED_DENIED
  const standing = text(row['standing'])
  if (standing === STANDING.early) return REFUSED_EARLY
  if (standing !== STANDING.live) return REFUSED_DENIED
  return { kind: 'caller', account: text(row['account']), selection: text(row['selection']) }
}

/** The caller of an acting call: valid, and its selection is the acting tenant of the request. */
export function actingCaller(
  port: Executor,
  facts: Readonly<{ login: string; nowKey: string; actingTenant: string; actingAccount: string }>,
): Caller | Refusal {
  const who = liveCaller(port, facts.login, facts.nowKey)
  if (who.kind !== 'caller') return who
  return who.selection === facts.actingTenant && who.account === facts.actingAccount
    ? who
    : REFUSED_DENIED
}

export type MembershipRow = Readonly<{ state: string; role: string; tenantText: string }>

/** The membership row of one account in one organization, active or not. */
export function membershipOf(
  port: Executor,
  organization: string,
  account: string,
): MembershipRow | undefined {
  const row = oneRow(
    port,
    `SELECT state, role, tenant_text FROM id_membership
      WHERE organization = ? AND account = ? LIMIT 1`,
    [organization, account],
  )
  return row === undefined
    ? undefined
    : { state: text(row['state']), role: text(row['role']), tenantText: text(row['tenant_text']) }
}

/** True when the account is an active member of the organization in the named role. */
export function holdsActiveRole(
  port: Executor,
  organization: string,
  account: string,
  role: string,
): boolean {
  const held = membershipOf(port, organization, account)
  return held !== undefined && held.state === MEMBERSHIP_ACTIVE && held.role === role
}

/** The kind of an organization (`personal` or `team`), or `undefined` when there is none. */
export function organizationKind(port: Executor, organization: string): string | undefined {
  const row = oneRow(port, 'SELECT kind FROM id_organization WHERE organization = ? LIMIT 1', [
    organization,
  ])
  return row === undefined ? undefined : text(row['kind'])
}

/**
 * A read handler: `parse` judges the raw input once, `read` works on the typed input. A malformed
 * input is a failed read, which the provider reports as `read_failed`.
 */
export function handler<Input, Output extends JsonValue>(
  name: string,
  parse: (raw: unknown) => Input | undefined,
  read: (input: Input, port: ReadPort) => Output,
): ReadHandlerModule {
  return {
    handler: name,
    protocol: PROTOCOL,
    read(raw, port): HandlerOutcome {
      const input = parse(raw)
      if (input === undefined) return { kind: 'failed', diagnostic: 'malformed input' }
      return { kind: 'read', output: read(input, port) }
    },
  }
}
