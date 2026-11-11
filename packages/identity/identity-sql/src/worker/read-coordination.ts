import type { JsonValue } from '@omne-harness/sql-contract'
import type { HandlerOutcome, ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { isRecord, isText } from './schema.ts'
import {
  actingCaller,
  holdsActiveRole,
  liveCaller,
  oneRow,
  rowsOf,
  text,
  type Row,
} from './support.ts'

function view(row: Row): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value === null ? null : text(value)]),
  )
}

function intentAuthority(
  facts: Record<string, unknown>,
  row: Row | undefined,
  caller: { login: string; nowKey: string; account: string },
  port: ReadPort,
): string | undefined {
  if (
    !isText(facts['actingTenant']) ||
    !isText(facts['actingAccount']) ||
    actingCaller(port, {
      login: caller.login,
      nowKey: caller.nowKey,
      actingTenant: facts['actingTenant'],
      actingAccount: facts['actingAccount'],
    }).kind !== 'caller'
  )
    return row?.['state'] === 'finished' && facts['kind'] === 'leave-organization'
      ? 'not-visible'
      : 'denied'
  if (
    facts['kind'] === 'change-member' &&
    (!isText(facts['organization']) ||
      !isText(facts['superAdminRole']) ||
      !holdsActiveRole(port, facts['organization'], caller.account, facts['superAdminRole']))
  )
    return 'denied'
  return undefined
}

function intentDisclosure(
  row: Row | undefined,
  login: string,
  nowKey: string,
  port: ReadPort,
): string | undefined {
  const who = liveCaller(port, login, nowKey)
  if (who.kind !== 'caller') return who.outcome
  const facts: unknown = row === undefined ? undefined : JSON.parse(text(row['facts']))
  if (!isRecord(facts) || !isText(facts['login'])) return 'not-visible'
  const initiating = oneRow(port, 'SELECT account FROM id_login WHERE login = ? LIMIT 1', [
    facts['login'],
  ])
  if (initiating === undefined || text(initiating['account']) !== who.account) return 'not-visible'
  return intentAuthority(facts, row, { login, nowKey, account: who.account }, port)
}

function readIntent(
  raw: Record<string, unknown>,
  operationId: string,
  port: ReadPort,
): HandlerOutcome {
  const row = oneRow(port, 'SELECT * FROM id_membership_intent WHERE operation_id = ? LIMIT 1', [
    operationId,
  ])
  if (isText(raw['login']) && isText(raw['nowKey'])) {
    const outcome = intentDisclosure(row, raw['login'], raw['nowKey'], port)
    if (outcome !== undefined) return { kind: 'read', output: { outcome } }
  }
  return { kind: 'read', output: { row: row === undefined ? null : view(row) } }
}

function boundedRows(rows: readonly Row[]): Record<string, JsonValue>[] {
  const output: Record<string, JsonValue>[] = []
  let bytes = 0
  for (const row of rows) {
    const entry = view(row)
    const size = JSON.stringify(entry).length * 3
    if (output.length > 0 && bytes + size > 1 << 19) break
    output.push(entry)
    bytes += size
  }
  return output
}

function readPage(raw: Record<string, unknown>, port: ReadPort): HandlerOutcome {
  if (
    !isText(raw['after']) ||
    typeof raw['limit'] !== 'number' ||
    !Number.isInteger(raw['limit']) ||
    raw['limit'] < 1 ||
    raw['limit'] > 100
  )
    return { kind: 'failed', diagnostic: 'input' }
  const reservations = raw['query'] === 'reservations'
  const { table, key, state } = reservations
    ? { table: 'id_standing_reservation', key: 'reservation_id', state: 'held' }
    : { table: 'id_membership_intent', key: 'operation_id', state: 'pending' }
  const member = reservations && isText(raw['organization']) && isText(raw['account'])
  const rows = rowsOf(
    port,
    `SELECT * FROM ${table} WHERE state = ? AND ${key} > ? ${member ? 'AND organization = ? AND account = ?' : ''} ORDER BY ${key} LIMIT ?`,
    [
      state,
      raw['after'],
      ...(member ? [String(raw['organization']), String(raw['account'])] : []),
      BigInt(raw['limit']),
    ],
  )
  const output = boundedRows(rows)
  return {
    kind: 'read',
    output: { rows: output, more: output.length < rows.length || rows.length === raw['limit'] },
  }
}

function readReservation(raw: Record<string, unknown>, port: ReadPort): HandlerOutcome | undefined {
  const key =
    raw['query'] === 'reservation'
      ? { column: 'reservation_id', value: raw['id'] }
      : raw['query'] === 'reservation-operation'
        ? { column: 'operation_ref', value: raw['operationRef'] }
        : undefined
  if (key === undefined || !isText(key.value)) return undefined
  const row = oneRow(
    port,
    `SELECT * FROM id_standing_reservation WHERE ${key.column} = ? LIMIT 1`,
    [key.value],
  )
  return { kind: 'read', output: { row: row === undefined ? null : view(row) } }
}

const handler: ReadHandlerModule = {
  handler: 'identity.coordination',
  protocol: '1',
  read(raw, port) {
    if (!isRecord(raw)) return { kind: 'failed', diagnostic: 'input' }
    const reservation = readReservation(raw, port)
    if (reservation !== undefined) return reservation
    if (raw['query'] === 'intent' && isText(raw['operationId']))
      return readIntent(raw, raw['operationId'], port)
    if (raw['query'] === 'reservations' || raw['query'] === 'intents') return readPage(raw, port)
    return { kind: 'failed', diagnostic: 'input' }
  },
}
export default handler
