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

export const nullableText = (cell: SqlCell | undefined): string | null =>
  cell === null || cell === undefined ? null : String(cell)

export const isTrue = (cell: SqlCell | undefined): boolean => cell === 1n || cell === 1

export function orderKeySql(column: string): string {
  return `(substr(${column}, 1, 19) || '.' || rtrim(iif(substr(${column}, 20, 1) = '.', substr(${column}, 21, length(${column}) - 21), ''), '0'))`
}

export function revokedSql(alias: string): string {
  return `EXISTS (SELECT 1 FROM id_login_revocation r WHERE r.login = ${alias}.login)`
}

export function issuedAfterSql(alias: string): string {
  return `${orderKeySql(`${alias}.issued_at`)} > ?`
}

function endedSql(alias: string): string {
  return `(${orderKeySql(`${alias}.max_deadline`)} <= ? OR ${orderKeySql(`${alias}.idle_deadline`)} <= ?)`
}

export function liveLoginSql(alias: string): string {
  return `NOT ${revokedSql(alias)} AND NOT ${issuedAfterSql(alias)} AND NOT ${endedSql(alias)}`
}

export const STANDING = Object.freeze({
  revoked: 'revoked',
  early: 'early',
  ended: 'ended',
  live: 'live',
})

export function loginStandingSql(alias: string): string {
  return `CASE WHEN ${revokedSql(alias)} THEN '${STANDING.revoked}'
    WHEN ${issuedAfterSql(alias)} THEN '${STANDING.early}'
    WHEN ${endedSql(alias)} THEN '${STANDING.ended}' ELSE '${STANDING.live}' END`
}

export type Caller = Readonly<{ kind: 'caller'; account: string; selection: string }>

export type Refusal = Readonly<{
  kind: 'refused'
  outcome: 'denied' | typeof CLOCK_EARLIER_THAN_RECORD
}>

const REFUSED_DENIED: Refusal = Object.freeze({ kind: 'refused', outcome: 'denied' })
const REFUSED_EARLY: Refusal = Object.freeze({
  kind: 'refused',
  outcome: CLOCK_EARLIER_THAN_RECORD,
})

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

export function holdsActiveRole(
  port: Executor,
  organization: string,
  account: string,
  role: string,
): boolean {
  const held = membershipOf(port, organization, account)
  return held !== undefined && held.state === MEMBERSHIP_ACTIVE && held.role === role
}

export function organizationKind(port: Executor, organization: string): string | undefined {
  const row = oneRow(port, 'SELECT kind FROM id_organization WHERE organization = ? LIMIT 1', [
    organization,
  ])
  return row === undefined ? undefined : text(row['kind'])
}

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
