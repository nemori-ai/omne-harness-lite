import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import type { JsonValue } from '@omne-harness/sql-contract'
import { isRecord, isText, MEMBERSHIP_ACTIVE, type GovernanceFacts } from './schema.ts'
import { oneRow, text, type Executor } from './support.ts'

export const STANDING_TABLES = ['id_standing_reservation', 'id_membership_intent'] as const
export type MembershipMode =
  | Readonly<{ kind: 'prepare' }>
  | Readonly<{ kind: 'apply'; operationId: string }>
const reply = (outcome: string, fields: Record<string, string> = {}): ParticipantReply => ({
  kind: 'participated',
  response: { outcome, ...fields },
})

export function membershipGate(
  port: Executor,
  organization: string,
  account: string,
  mode?: MembershipMode,
): ParticipantReply | undefined {
  if (mode?.kind === 'prepare') return reply('pending', { organization, account })
  const held = oneRow(
    port,
    `SELECT 1 FROM id_standing_reservation WHERE organization = ? AND account = ? AND state = 'held' LIMIT 1`,
    [organization, account],
  )
  if (held !== undefined) return reply('blocked')
  const first = oneRow(
    port,
    `SELECT operation_id FROM id_membership_intent WHERE organization = ? AND account = ? AND state = 'pending' ORDER BY sequence LIMIT 1`,
    [organization, account],
  )
  if (
    first !== undefined &&
    (mode?.kind !== 'apply' || text(first['operation_id']) !== mode.operationId)
  )
    return reply('blocked')
  return undefined
}

function reservation(raw: Record<string, unknown>, port: ParticipantPort): ParticipantReply {
  const names = [
    'id',
    'operationRef',
    'binding',
    'required',
    'organization',
    'account',
    'tenantText',
    'roleModel',
    'roleModelRevision',
    'knownQualifications',
    'knownRoles',
    'qualifiedRoles',
  ] as const
  if (!names.every(key => isText(raw[key]))) return { kind: 'unsupported', basis: 'standing-facts' }
  const f = raw as Record<(typeof names)[number], string>
  const existing = oneRow(
    port,
    'SELECT reservation_id, binding, required, state, terminal FROM id_standing_reservation WHERE operation_ref = ? LIMIT 1',
    [f.operationRef],
  )
  if (existing !== undefined) {
    if (
      text(existing['reservation_id']) !== f.id ||
      text(existing['binding']) !== f.binding ||
      text(existing['required']) !== f.required
    )
      return reply('operation-conflict')
    return reply(text(existing['state']), {
      terminal: existing['terminal'] === null ? '' : text(existing['terminal']),
    })
  }
  const member = oneRow(
    port,
    `SELECT state, role_model, role_model_revision, role FROM id_membership WHERE organization = ? AND account = ? AND tenant_text = ? LIMIT 1`,
    [f.organization, f.account, f.tenantText],
  )
  if (member === undefined || text(member['state']) !== MEMBERSHIP_ACTIVE) return reply('denied')
  const required: unknown = JSON.parse(f.required)
  const knownQualifications: unknown = JSON.parse(f.knownQualifications)
  const knownRoles: unknown = JSON.parse(f.knownRoles)
  const qualifiedRoles: unknown = JSON.parse(f.qualifiedRoles)
  if (
    !Array.isArray(required) ||
    !Array.isArray(knownQualifications) ||
    !Array.isArray(knownRoles) ||
    !Array.isArray(qualifiedRoles) ||
    ![...required, ...knownQualifications, ...knownRoles, ...qualifiedRoles].every(isText)
  )
    return { kind: 'unsupported', basis: 'standing-mapping' }
  if (required.some(item => !knownQualifications.includes(item))) return reply('denied')
  if (
    text(member['role_model']) !== f.roleModel ||
    text(member['role_model_revision']) !== f.roleModelRevision ||
    !knownRoles.includes(text(member['role']))
  )
    return reply('unavailable')
  if (!qualifiedRoles.includes(text(member['role']))) return reply('denied')
  const pending = oneRow(
    port,
    `SELECT 1 FROM id_membership_intent WHERE organization = ? AND account = ? AND state = 'pending' LIMIT 1`,
    [f.organization, f.account],
  )
  if (pending !== undefined) return reply('blocked')
  port.execute(
    `INSERT INTO id_standing_reservation (reservation_id, operation_ref, binding, required, organization, account, state, terminal) VALUES (?, ?, ?, ?, ?, ?, 'held', NULL)`,
    [f.id, f.operationRef, f.binding, f.required, f.organization, f.account],
  )
  return reply('held')
}

function finish(raw: Record<string, unknown>, port: ParticipantPort): ParticipantReply {
  if (
    !isText(raw['id']) ||
    !isText(raw['binding']) ||
    !isText(raw['required']) ||
    (raw['terminal'] !== 'aborted' && raw['terminal'] !== 'committed')
  )
    return { kind: 'unsupported', basis: 'standing-finish' }
  const saved = oneRow(
    port,
    'SELECT binding, required, state, terminal FROM id_standing_reservation WHERE reservation_id = ? LIMIT 1',
    [raw['id']],
  )
  if (saved === undefined) return reply('not-found')
  if (text(saved['binding']) !== raw['binding'] || text(saved['required']) !== raw['required'])
    return reply('operation-conflict')
  if (text(saved['state']) === 'settled')
    return reply('settled', { terminal: text(saved['terminal']) })
  port.execute(
    `UPDATE id_standing_reservation SET state = 'settled', terminal = ? WHERE reservation_id = ? AND state = 'held'`,
    [raw['terminal'], raw['id']],
  )
  return reply('settled', { terminal: raw['terminal'] })
}

export type Govern = (
  facts: GovernanceFacts,
  port: ParticipantPort,
  mode?: MembershipMode,
) => ParticipantReply
export type ParseGovern = (raw: unknown) => GovernanceFacts | undefined

function responseOf(result: ParticipantReply): Record<string, JsonValue> | undefined {
  return result.kind === 'participated' && isRecord(result.response) ? result.response : undefined
}

function admitIntent(
  raw: Record<string, unknown>,
  port: ParticipantPort,
  govern: Govern,
  parse: ParseGovern,
): ParticipantReply {
  if (!isText(raw['operationId']) || !isText(raw['facts']))
    return { kind: 'unsupported', basis: 'intent' }
  const facts = parse(JSON.parse(raw['facts']))
  if (facts === undefined) return { kind: 'unsupported', basis: 'intent-facts' }
  const existing = oneRow(
    port,
    'SELECT facts, state, response FROM id_membership_intent WHERE operation_id = ? LIMIT 1',
    [raw['operationId']],
  )
  if (existing !== undefined)
    return text(existing['facts']) === raw['facts']
      ? reply(text(existing['state']))
      : reply('operation-conflict')
  const result = govern(facts, port, { kind: 'prepare' })
  const response = responseOf(result)
  if (response === undefined) return result
  const pending = response['outcome'] === 'pending'
  port.execute(
    `INSERT INTO id_membership_intent (operation_id, facts, organization, account, state, response, attempt, now_key) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [
      raw['operationId'],
      raw['facts'],
      pending && isText(response['organization']) ? response['organization'] : null,
      pending && isText(response['account']) ? response['account'] : null,
      pending ? 'pending' : 'finished',
      pending ? null : JSON.stringify(response),
    ],
  )
  return reply(pending ? 'pending' : 'finished')
}

function prepareAttempt(raw: Record<string, unknown>, port: ParticipantPort): ParticipantReply {
  if (!isText(raw['operationId']) || !isText(raw['nowKey']) || !isText(raw['expectedAttempt']))
    return { kind: 'unsupported', basis: 'attempt' }
  const saved = oneRow(
    port,
    'SELECT state, attempt, organization, account FROM id_membership_intent WHERE operation_id = ? LIMIT 1',
    [raw['operationId']],
  )
  if (saved === undefined) return reply('not-found')
  if (text(saved['state']) === 'finished') return reply('finished')
  if (text(saved['attempt']) !== raw['expectedAttempt']) return reply('superseded')
  const blocked = membershipGate(port, text(saved['organization']), text(saved['account']), {
    kind: 'apply',
    operationId: raw['operationId'],
  })
  if (blocked !== undefined) return blocked
  const attempt = BigInt(raw['expectedAttempt']) + 1n
  port.execute('UPDATE id_membership_intent SET attempt = ?, now_key = ? WHERE operation_id = ?', [
    attempt,
    raw['nowKey'],
    raw['operationId'],
  ])
  return reply('prepared', { attempt: String(attempt), nowKey: raw['nowKey'] })
}

function applyIntent(
  raw: Record<string, unknown>,
  port: ParticipantPort,
  govern: Govern,
  parse: ParseGovern,
): ParticipantReply {
  if (!isText(raw['operationId']) || !isText(raw['attempt']) || !isText(raw['nowKey']))
    return { kind: 'unsupported', basis: 'apply' }
  const saved = oneRow(
    port,
    'SELECT state, response, facts, attempt, now_key FROM id_membership_intent WHERE operation_id = ? LIMIT 1',
    [raw['operationId']],
  )
  if (saved === undefined) return reply('not-found')
  if (text(saved['state']) === 'finished') return reply('finished')
  if (text(saved['attempt']) !== raw['attempt'] || text(saved['now_key']) !== raw['nowKey'])
    return reply('superseded')
  const original: unknown = JSON.parse(text(saved['facts']))
  if (!isRecord(original)) return { kind: 'failed', diagnostic: 'intent-facts' }
  const facts = parse({ ...original, nowKey: raw['nowKey'] })
  if (facts === undefined) return { kind: 'failed', diagnostic: 'intent-facts' }
  const result = govern(facts, port, { kind: 'apply', operationId: raw['operationId'] })
  const response = responseOf(result)
  if (response === undefined || response['outcome'] === 'blocked') return result
  port.execute(
    `UPDATE id_membership_intent SET state = 'finished', response = ? WHERE operation_id = ?`,
    [JSON.stringify(response), raw['operationId']],
  )
  return reply('finished')
}

export function standingCommand(
  raw: Record<string, unknown>,
  port: ParticipantPort,
  govern: Govern,
  parse: ParseGovern,
): ParticipantReply | undefined {
  switch (raw['kind']) {
    case 'standing-reserve':
      return reservation(raw, port)
    case 'standing-finish':
      return finish(raw, port)
    case 'membership-admit':
      return admitIntent(raw, port, govern, parse)
    case 'membership-prepare':
      return prepareAttempt(raw, port)
    case 'membership-apply':
      return applyIntent(raw, port, govern, parse)
    default:
      return undefined
  }
}
