import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
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

const handler: ReadHandlerModule = {
  handler: 'identity.coordination',
  protocol: '1',
  read(raw, port) {
    if (!isRecord(raw)) return { kind: 'failed', diagnostic: 'input' }
    if (raw['query'] === 'reservation' && isText(raw['id'])) {
      const row = oneRow(
        port,
        'SELECT * FROM id_standing_reservation WHERE reservation_id = ? LIMIT 1',
        [raw['id']],
      )
      return { kind: 'read', output: { row: row === undefined ? null : view(row) } }
    }
    if (raw['query'] === 'intent' && isText(raw['operationId'])) {
      const row = oneRow(
        port,
        'SELECT * FROM id_membership_intent WHERE operation_id = ? LIMIT 1',
        [raw['operationId']],
      )
      if (isText(raw['login']) && isText(raw['nowKey'])) {
        const who = liveCaller(port, raw['login'], raw['nowKey'])
        if (who.kind !== 'caller') return { kind: 'read', output: { outcome: who.outcome } }
        const facts: unknown = row === undefined ? undefined : JSON.parse(text(row['facts']))
        if (!isRecord(facts) || !isText(facts['login']))
          return { kind: 'read', output: { outcome: 'not-visible' } }
        const initiating = oneRow(port, 'SELECT account FROM id_login WHERE login = ? LIMIT 1', [
          facts['login'],
        ])
        if (initiating === undefined || text(initiating['account']) !== who.account)
          return { kind: 'read', output: { outcome: 'not-visible' } }
        if (
          !isText(facts['actingTenant']) ||
          !isText(facts['actingAccount']) ||
          actingCaller(port, {
            login: raw['login'],
            nowKey: raw['nowKey'],
            actingTenant: facts['actingTenant'],
            actingAccount: facts['actingAccount'],
          }).kind !== 'caller'
        )
          return {
            kind: 'read',
            output: {
              outcome:
                row?.['state'] === 'finished' && facts['kind'] === 'leave-organization'
                  ? 'not-visible'
                  : 'denied',
            },
          }
        if (
          facts['kind'] === 'change-member' &&
          (!isText(facts['organization']) ||
            !isText(facts['superAdminRole']) ||
            !holdsActiveRole(port, facts['organization'], who.account, facts['superAdminRole']))
        )
          return { kind: 'read', output: { outcome: 'denied' } }
      }
      return { kind: 'read', output: { row: row === undefined ? null : view(row) } }
    }
    if (
      (raw['query'] === 'reservations' || raw['query'] === 'intents') &&
      isText(raw['after']) &&
      typeof raw['limit'] === 'number' &&
      Number.isInteger(raw['limit']) &&
      raw['limit'] >= 1 &&
      raw['limit'] <= 100
    ) {
      const reservations = raw['query'] === 'reservations'
      const table = reservations ? 'id_standing_reservation' : 'id_membership_intent'
      const key = reservations ? 'reservation_id' : 'operation_id'
      const state = reservations ? 'held' : 'pending'
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
      const output: Record<string, JsonValue>[] = []
      let bytes = 0
      for (const row of rows) {
        const entry = view(row)
        const size = JSON.stringify(entry).length * 3
        if (output.length > 0 && bytes + size > 1 << 19) break
        output.push(entry)
        bytes += size
      }
      return {
        kind: 'read',
        output: { rows: output, more: output.length < rows.length || rows.length === raw['limit'] },
      }
    }
    return { kind: 'failed', diagnostic: 'input' }
  },
}
export default handler
