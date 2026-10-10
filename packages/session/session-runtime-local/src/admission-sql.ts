import { narrow, type ReadTx, type StorageUnit } from '@omne-harness-lite/storage'
import { parseTenantRole, isOk } from '@omne-harness-lite/identity-values'
import {
  AdmissionFailure,
  type AdmissionPolicy,
  type AdmissionReading,
  type AdmissionSource,
  type AdmissionState,
  type AdmissionTarget,
  type AdmissionTicket,
} from './admission-types.ts'
import {
  bounded,
  checkedSource,
  checkedTarget,
  requestKey,
  sourceKey,
  memberKey,
  memberBinding,
} from './admission-values.ts'

export interface AdmissionDb {
  sr_admission_meta: { slot: number; format: number; root: string; sequence: string }
  sr_admission_login: { key: string; source: string; state: 'checking' | 'allowed' | 'rejected' }
  sr_admission_member: { key: string; binding: string; state: 'checking' | 'allowed' | 'rejected' }
  sr_admission_ticket: {
    id: string
    login_key: string
    member_key: string | null
    request_key: string
    sequence: string
    sequence_length: number
    target: string
    state: AdmissionState
    member_role: string | null
    query_generation: number
  }
}
export interface UseDb {
  sr_admission_use: { root: string; ticket: string; binding: string; receipt: string }
}
export async function meta(tx: ReadTx) {
  const rows = await narrow<AdmissionDb>(tx).selectFrom('sr_admission_meta').selectAll().execute()
  const value = rows[0]
  if (
    rows.length !== 1 ||
    value?.slot !== 1 ||
    value.format !== 3 ||
    typeof value.root !== 'string' ||
    value.root.length === 0 ||
    typeof value.sequence !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value.sequence)
  )
    throw new AdmissionFailure('invalid-record')
  return value
}
export async function login(tx: ReadTx, source: AdmissionSource) {
  const value = await narrow<AdmissionDb>(tx)
    .selectFrom('sr_admission_login')
    .selectAll()
    .where('key', '=', sourceKey(source))
    .executeTakeFirst()
  if (value === undefined) return undefined
  if (
    value.source !== JSON.stringify(source) ||
    !['checking', 'allowed', 'rejected'].includes(value.state)
  )
    throw new AdmissionFailure('invalid-record')
  return value
}
export function parseTarget(
  text: string,
  source: AdmissionSource,
  policy: AdmissionPolicy,
): AdmissionTarget {
  try {
    const target = checkedTarget(JSON.parse(bounded(text, policy)), source)
    if (JSON.stringify(target) !== text) throw new AdmissionFailure('invalid-record')
    return target
  } catch {
    throw new AdmissionFailure('invalid-record')
  }
}
export async function reading(
  tx: ReadTx,
  ticket: AdmissionTicket,
  policy: AdmissionPolicy,
): Promise<AdmissionReading> {
  const root = await meta(tx)
  if (root.root !== ticket.root) throw new AdmissionFailure('denied')
  const row = await narrow<AdmissionDb>(tx)
    .selectFrom('sr_admission_ticket')
    .selectAll()
    .where('id', '=', ticket.id)
    .executeTakeFirst()
  if (!row || !matchesTicket(row, ticket)) throw new AdmissionFailure('denied')
  checkQueryGeneration(row.query_generation)
  if (
    row.sequence_length !== row.sequence.length ||
    ![
      'waiting',
      'querying',
      'ready',
      'consumed',
      'rejected',
      'memberRejected',
      'unavailable',
      'notUsed',
    ].includes(row.state)
  )
    throw new AdmissionFailure('invalid-record')
  if (
    row.member_key !==
    (ticket.target.purpose === 'createSession'
      ? memberKey(ticket.source, ticket.target.tenant)
      : null)
  )
    throw new AdmissionFailure('invalid-record')
  parseTarget(row.target, ticket.source, policy)
  const owner = await login(tx, ticket.source)
  if (!owner) throw new AdmissionFailure('invalid-record')
  return { ticket, state: row.state, ...memberObservation(row, ticket) }
}
function memberObservation(
  row: AdmissionDb['sr_admission_ticket'],
  ticket: AdmissionTicket,
): Pick<AdmissionReading, 'memberStanding'> {
  if (row.member_role === null) return {}
  const role = parseTenantRole(row.member_role)
  if (
    !isOk(role) ||
    ticket.target.purpose !== 'createSession' ||
    ['waiting', 'querying', 'memberRejected', 'unavailable'].includes(row.state)
  )
    throw new AdmissionFailure('invalid-record')
  return { memberStanding: Object.freeze({ standing: 'effective', role: role.ok }) }
}
function matchesTicket(row: AdmissionDb['sr_admission_ticket'], ticket: AdmissionTicket): boolean {
  return (
    row.login_key === sourceKey(ticket.source) &&
    row.request_key === requestKey(ticket.source, ticket.target) &&
    row.sequence === ticket.sequence &&
    row.target === JSON.stringify(ticket.target)
  )
}
export function decisionState(decision: {
  readonly kind: 'valid' | 'memberValid' | 'memberRejected' | 'rejected' | 'unavailable'
}): AdmissionState {
  return decision.kind === 'valid' || decision.kind === 'memberValid' ? 'ready' : decision.kind
}
export async function settleMember(
  tx: ReadTx,
  ticket: AdmissionTicket,
  decision: { readonly kind: string },
): Promise<void> {
  if (decision.kind !== 'memberValid' && decision.kind !== 'memberRejected') return
  await narrow<AdmissionDb>(tx)
    .updateTable('sr_admission_member')
    .set({ state: decision.kind === 'memberValid' ? 'allowed' : 'rejected' })
    .where('key', '=', memberKey(ticket.source, ticket.target.tenant))
    .execute()
}
export async function settleLogin(
  tx: ReadTx,
  ticket: AdmissionTicket,
  decision: { readonly kind: string },
  rejected: boolean,
): Promise<void> {
  const state = rejected
    ? 'rejected'
    : ['valid', 'memberValid', 'memberRejected'].includes(decision.kind)
      ? 'allowed'
      : 'checking'
  const db = narrow<AdmissionDb>(tx)
  await db
    .updateTable('sr_admission_login')
    .set({ state })
    .where('key', '=', sourceKey(ticket.source))
    .execute()
  if (rejected)
    await db
      .updateTable('sr_admission_ticket')
      .set({ state: 'rejected' })
      .where('login_key', '=', sourceKey(ticket.source))
      .where('state', '=', 'waiting')
      .execute()
}
export async function count(
  tx: ReadTx,
  table: 'sr_admission_ticket' | 'sr_admission_login',
): Promise<number> {
  const value = await narrow<AdmissionDb>(tx)
    .selectFrom(table)
    .select(({ fn }) => fn.countAll<number>().as('total'))
    .executeTakeFirstOrThrow()
  return Number(value.total)
}
export async function recordedUse(
  unit: StorageUnit,
  ticket: AdmissionTicket,
  policy: Pick<AdmissionPolicy, 'maxRecordBytes'>,
): Promise<string | undefined> {
  return unit.query(async tx => {
    const value = await narrow<UseDb>(tx)
      .selectFrom('sr_admission_use')
      .selectAll()
      .where('root', '=', ticket.root)
      .where('ticket', '=', ticket.id)
      .executeTakeFirst()
    if (!value) return undefined
    if (
      value.binding !== JSON.stringify(ticket) ||
      typeof value.receipt !== 'string' ||
      value.receipt.length === 0
    )
      throw new AdmissionFailure('invalid-record')
    try {
      return bounded(value.receipt, policy)
    } catch {
      throw new AdmissionFailure('invalid-record')
    }
  })
}
export async function saveUse(
  unit: StorageUnit,
  ticket: AdmissionTicket,
  receipt: string,
  policy: AdmissionPolicy,
): Promise<void> {
  if (typeof receipt !== 'string' || receipt.length === 0)
    throw new AdmissionFailure('invalid-input')
  bounded(receipt, policy)
  await unit.mutate(tx =>
    narrow<UseDb>(tx)
      .insertInto('sr_admission_use')
      .values({ root: ticket.root, ticket: ticket.id, binding: JSON.stringify(ticket), receipt })
      .execute(),
  )
}
export function parseSource(text: string): AdmissionSource {
  try {
    const source = checkedSource(JSON.parse(text))
    if (JSON.stringify(source) !== text) throw new AdmissionFailure('invalid-record')
    return source
  } catch {
    throw new AdmissionFailure('invalid-record')
  }
}

export async function memberAllowed(
  tx: ReadTx,
  source: AdmissionSource,
  tenant: AdmissionTarget['tenant'],
): Promise<boolean> {
  const key = memberKey(source, tenant),
    db = narrow<AdmissionDb>(tx)
  const row = await db
    .selectFrom('sr_admission_member')
    .selectAll()
    .where('key', '=', key)
    .executeTakeFirst()
  if (!row) return false
  if (
    row.binding !== memberBinding(source, tenant) ||
    !['checking', 'allowed', 'rejected'].includes(row.state)
  )
    throw new AdmissionFailure('invalid-record')
  if (row.state !== 'allowed') return false
  const pending = await db
    .selectFrom('sr_admission_ticket')
    .select('id')
    .where('member_key', '=', key)
    .where('state', '=', 'querying')
    .executeTakeFirst()
  return pending === undefined
}
export async function queueReady(
  tx: ReadTx,
  column: 'login_key' | 'member_key',
  key: string,
  ticket: AdmissionTicket,
): Promise<boolean> {
  const db = narrow<AdmissionDb>(tx)
  const active = await db
    .selectFrom('sr_admission_ticket')
    .select('id')
    .where(column, '=', key)
    .where('state', 'in', ['querying', 'ready'])
    .executeTakeFirst()
  if (active) return false
  const first = await db
    .selectFrom('sr_admission_ticket')
    .select('id')
    .where(column, '=', key)
    .where('state', '=', 'waiting')
    .orderBy('sequence_length')
    .orderBy('sequence')
    .executeTakeFirst()
  return first?.id === ticket.id
}

function checkQueryGeneration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new AdmissionFailure('invalid-record')
}
