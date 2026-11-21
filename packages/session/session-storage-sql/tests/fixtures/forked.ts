import { judgeMessage } from '@omne-harness/message'
import type {
  ForkPoint,
  ModelViewRow,
  SessionCommand,
  SessionCreation,
} from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { modelViewPrefix } from '../../src/model-view-identity.ts'
import { TENANT_A, textOf, type App } from './app.ts'

// What the fork specs share: a source whose view is seeded row by row, the point of its whole view,
// and the reads of a session as its callers make them.

export const T = textOf(TENANT_A)
export const DOMAIN = 'dom_0'

export const messageText = (role: string, content: string): string =>
  JSON.stringify({
    id: 'msg_abcdefghijklmnopqrstuv',
    role,
    blocks: [
      { kind: 'text', id: 't', text: content, visibility: { toModel: true, toHuman: true } },
    ],
  })

export const tailOf = (a: App, session: string): bigint =>
  BigInt(
    a.provider.select(
      DOMAIN,
      'SELECT COALESCE(MAX(position), 0) FROM sl_entry WHERE tenant = ? AND session = ?',
      [T, session],
    ).rows[0]?.[0] as bigint,
  )

/** Gives a session `count` more rows of its current view, each with an entry of its own. */
export function seedRows(a: App, session: string, count: number, role = 'user'): void {
  const from = tailOf(a, session)
  const last = a.provider.select(
    DOMAIN,
    "SELECT COALESCE(MAX(seq), 0) FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = 'epoch:0'",
    [T, session],
  ).rows[0]?.[0] as bigint
  for (let index = 1; index <= count; index += 1) {
    const position = from + BigInt(index)
    a.provider.seed(
      DOMAIN,
      'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [T, session, position, 1n, `message.${role}`, new Uint8Array([0]), 1n],
    )
    a.provider.seed(
      DOMAIN,
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        T,
        session,
        'epoch:0',
        BigInt(last) + BigInt(index),
        String(position),
        40n,
        `digest-${session}-${position}`,
        messageText(role, `row ${index} of ${session}`),
      ],
    )
  }
}

export async function rowsOf(a: App, session: string, pageBytes = 10_000_000) {
  const rows: ModelViewRow[] = []
  let after: string | null = null
  let basis = null
  for (;;) {
    const page = await a.port.history.readModelView({
      ...a.access(TENANT_A, session),
      basis,
      after,
      pageBytes,
    })
    if (!('ok' in page) || page.ok.kind !== 'page') throw new Error(JSON.stringify(page))
    rows.push(...page.ok.rows)
    basis = page.ok.basis
    after = page.ok.next
    if (after === null) return { rows, basis: page.ok.basis }
  }
}

/** The point of the whole view of an idle session: a boundary while no Run of it is unfinished. */
export async function wholeOf(a: App, session: string): Promise<ForkPoint> {
  const { basis } = await rowsOf(a, session)
  return { ...basis, position: String(tailOf(a, session)) }
}

export const epochOf = (session: string, epoch = 'epoch:0'): string =>
  `${modelViewPrefix(T, session)}${epoch}`

export const childOf = (
  parent: string,
  point: ForkPoint | null,
): Pick<SessionCreation, 'relation' | 'attendance' | 'fork'> => ({
  relation: { kind: 'child', parent: sessionId(parent), basis: evidence('dispatch') },
  attendance: 'unattended',
  ...(point === null ? {} : { fork: { source: sessionId(parent), point } }),
})

/** Tells the model something outside a Run: one more row of the view of the session. */
export async function remind(a: App, session: string, name: string) {
  const reminder = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'system_reminder',
    blocks: [{ kind: 'text', id: name, text: name, visibility: { toHuman: false, toModel: true } }],
  })
  if (!('ok' in reminder)) throw new Error('the reminder fixture is invalid')
  const work = await a.port.readWork(a.access(TENANT_A, session))
  if (!('ok' in work)) throw new Error(JSON.stringify(work))
  const command: SessionCommand = {
    kind: 'commitDerived',
    input: {
      tenant: TENANT_A,
      session: sessionId(session),
      operation: operationId(`remind-${session}-${name}`),
      expected: work.ok.revision,
      value: { kind: 'context-reminder', message: reminder.ok, source: evidence(name) },
    },
  }
  return a.port.commit({ access: a.access(TENANT_A, session), command, guards: [] })
}

export const count = (a: App, table: string, session: string): number =>
  a.provider.select(DOMAIN, `SELECT COUNT(*) FROM ${table} WHERE tenant = ? AND session = ?`, [
    T,
    session,
  ]).rows[0]?.[0] as never as number
