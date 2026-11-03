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
import { MEMBERSHIP_ACTIVE, PROTOCOL } from './schema.ts'

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

/**
 * The condition that the login row `alias` is valid at the reading with order key `?`, `?`: not
 * revoked, and the reading earlier than both deadlines. It takes the reading's key twice.
 */
export function liveLoginSql(alias: string): string {
  return `NOT EXISTS (SELECT 1 FROM id_login_revocation r WHERE r.login = ${alias}.login)
    AND ${orderKeySql(`${alias}.max_deadline`)} > ? AND ${orderKeySql(`${alias}.idle_deadline`)} > ?`
}

/** The initiating login when it is valid at `nowKey`: its account and its current selection. */
export function liveCaller(
  port: Executor,
  login: string,
  nowKey: string,
): Readonly<{ account: string; selection: string }> | undefined {
  const row = oneRow(
    port,
    `SELECT l.account AS account, l.tenant_text AS selection FROM id_login l
      WHERE l.login = ? AND ${liveLoginSql('l')} LIMIT 1`,
    [login, nowKey, nowKey],
  )
  return row === undefined
    ? undefined
    : { account: text(row['account']), selection: text(row['selection']) }
}

/** The caller of an acting call: valid, and its selection is the acting tenant of the request. */
export function actingCaller(
  port: Executor,
  facts: Readonly<{ login: string; nowKey: string; actingTenant: string; actingAccount: string }>,
): Readonly<{ account: string; selection: string }> | undefined {
  const who = liveCaller(port, facts.login, facts.nowKey)
  return who !== undefined &&
    who.selection === facts.actingTenant &&
    who.account === facts.actingAccount
    ? who
    : undefined
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
