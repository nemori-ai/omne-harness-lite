import type { ForkFacts, ForkPoint, SessionCommand } from '@omne-harness/session-contract'
import { modelViewPrefix } from '../model-view-identity.ts'
import { big, oneRow, rowsOf, text, type Executor, type Row, type Scope } from './support.ts'

// The one place that knows a view may stand on rows of another session: a segment says the rows up
// to `upto` are those of that session at the same seq. Rows are only appended, so they stay there.

export const FORK_MIGRATION = { owner: 'session', id: '014-session-fork' } as const
export const FORK_TABLES = ['sl_fork', 'sl_view_segment'] as const
export const FORK_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_fork (
    tenant TEXT NOT NULL, session TEXT NOT NULL, src_session TEXT NOT NULL, src_epoch TEXT NOT NULL,
    upper INTEGER NOT NULL, position INTEGER NOT NULL, origin TEXT NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT, WITHOUT ROWID`,
  `CREATE TABLE sl_view_segment (
    tenant TEXT NOT NULL, session TEXT NOT NULL, epoch TEXT NOT NULL, upto INTEGER NOT NULL,
    src_session TEXT NOT NULL, src_epoch TEXT NOT NULL,
    PRIMARY KEY (tenant, session, epoch, upto)) STRICT, WITHOUT ROWID`,
]

/** The epoch a forked session starts in: the only one whose rows may stand elsewhere. */
export const FIRST_EPOCH = 'epoch:0'
const VIEW_COLUMNS = 'seq, entry, bytes, prefix_digest, message'

export class SegmentUnreadable extends Error {}

export type Fork = Readonly<{
  source: string
  epoch: string
  upper: bigint
  position: bigint
  origin: string
}>

export function forkOf(port: Executor, scope: Scope): Fork | undefined {
  const row = oneRow(
    port,
    'SELECT src_session, src_epoch, upper, position, origin FROM sl_fork WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (row === undefined) return undefined
  return {
    source: text(row['src_session']),
    epoch: text(row['src_epoch']),
    upper: big(row['upper']),
    position: big(row['position']),
    origin: text(row['origin']),
  }
}

type Piece = Readonly<{ session: string; epoch: string; above: bigint; upto: bigint | null }>

function segmentsOf(port: Executor, scope: Scope, epoch: string): Piece[] {
  if (epoch !== FIRST_EPOCH) return []
  const rows = rowsOf(
    port,
    'SELECT upto, src_session, src_epoch FROM sl_view_segment WHERE tenant = ? AND session = ? AND epoch = ? ORDER BY upto LIMIT 3',
    [scope.tenant, scope.session, epoch],
  )
  let above = 0n
  return rows.map(row => {
    const piece = {
      session: text(row['src_session']),
      epoch: text(row['src_epoch']),
      above,
      upto: big(row['upto']),
    }
    above = piece.upto
    return piece
  })
}

export type View = Readonly<{
  upper(): bigint
  rows(after: bigint, upper: bigint, limit: number, columns?: string): Row[]
  rowOf(entry: string): Row | undefined
}>

export function viewOf(port: Executor, scope: Scope, epoch: string): View {
  const segments = segmentsOf(port, scope, epoch)
  const inherited = segments.at(-1)?.upto ?? 0n
  const own: Piece = { session: scope.session, epoch, above: inherited, upto: null }
  const key = (piece: Piece) => [scope.tenant, piece.session, piece.epoch]
  return {
    upper() {
      const last = oneRow(
        port,
        'SELECT seq FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ? AND seq > ? ORDER BY seq DESC LIMIT 1',
        [...key(own), inherited],
      )
      return last === undefined ? inherited : big(last['seq'])
    },
    rows(after, upper, limit, columns = VIEW_COLUMNS) {
      const out: Row[] = []
      for (const piece of [...segments, own]) {
        const from = after > piece.above ? after : piece.above
        const to = piece.upto === null || upper < piece.upto ? upper : piece.upto
        const wanted = limit - out.length
        if (from >= to || wanted < 1) continue
        const rows = rowsOf(
          port,
          `SELECT ${columns} FROM sl_model_view
            WHERE tenant = ? AND session = ? AND epoch = ? AND seq > ? AND seq <= ? ORDER BY seq LIMIT ?`,
          [...key(piece), from, to, BigInt(wanted)],
        )
        if (piece.upto !== null && BigInt(rows.length) < to - from && rows.length < wanted)
          throw new SegmentUnreadable(`rows of a segment under ${piece.session} are not there`)
        out.push(...rows)
      }
      return out
    },
    rowOf(entry) {
      for (const piece of [own, ...segments]) {
        const row = oneRow(
          port,
          `SELECT ${VIEW_COLUMNS} FROM sl_model_view
            WHERE tenant = ? AND session = ? AND epoch = ? AND entry = ? LIMIT 1`,
          [...key(piece), entry],
        )
        const seq = row === undefined ? 0n : big(row['seq'])
        if (seq > piece.above && (piece.upto === null || seq <= piece.upto)) return row
      }
      return undefined
    },
  }
}

type Head = Readonly<{ seq: bigint; digest: string }>
const headOf = (row: Row): Head => ({ seq: big(row['seq']), digest: text(row['prefix_digest']) })

/** The row the next row of a view goes on from: its own last row, else the last row of its last segment. */
export function viewHead(port: Executor, scope: Scope, epoch: string): Head | undefined {
  const own = oneRow(
    port,
    'SELECT seq, prefix_digest FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ? ORDER BY seq DESC LIMIT 1',
    [scope.tenant, scope.session, epoch],
  )
  if (own !== undefined) return headOf(own)
  const last = segmentsOf(port, scope, epoch).at(-1)
  if (last === undefined) return undefined
  const row = oneRow(
    port,
    'SELECT seq, prefix_digest FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ? AND seq = ? LIMIT 1',
    [scope.tenant, last.session, last.epoch, last.upto],
  )
  if (row === undefined)
    throw new SegmentUnreadable(`the last row of a segment under ${last.session} is not there`)
  return headOf(row)
}

/** The session an entry position of the chain of a session lives in: at most two steps up. */
export function entrySession(port: Executor, scope: Scope, position: bigint): string {
  let session = scope.session
  for (let step = 0; step < 2; step += 1) {
    const fork = forkOf(port, { tenant: scope.tenant, session })
    if (fork === undefined || position > fork.position) return session
    session = fork.source
  }
  return session
}

const tailOf = (port: Executor, scope: Scope, fork: Fork | undefined): bigint => {
  const head = oneRow(
    port,
    'SELECT MAX(position) AS p FROM sl_entry WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  return head === undefined || head['p'] === null ? (fork?.position ?? 0n) : big(head['p'])
}

const roleOf = (message: string): ForkFacts['next'] =>
  message.startsWith('{') ? (JSON.parse(message) as { role: ForkFacts['next'] }).role : 'compaction'

type Source = Readonly<{ session: string; epoch: string; running: boolean }>

export function forkFacts(
  port: Executor,
  tenant: string,
  source: Source,
  point: ForkPoint,
): ForkFacts {
  const scope = { tenant, session: source.session }
  const fork = forkOf(port, scope)
  const tail = String(tailOf(port, scope, fork))
  const prefix = modelViewPrefix(tenant, source.session)
  const facts = { current: false, running: source.running, floor: '0', tail, next: null }
  if (!point.epoch.startsWith(prefix)) return { ...facts, rows: null }
  const epoch = point.epoch.slice(prefix.length)
  const view = viewOf(port, scope, epoch)
  const rows = view.upper()
  const current = epoch === source.epoch
  if (rows === 0n && !current) return { ...facts, rows: null }
  if (!/^[1-9][0-9]*$/u.test(point.upper)) return { ...facts, rows: String(rows), current }
  const upper = BigInt(point.upper)
  const around = upper > rows ? [] : view.rows(upper - 1n, upper + 1n, 2, 'seq, entry, message')
  const anchor = /^epoch:[1-9][0-9]*$/u.test(epoch) ? BigInt(epoch.slice('epoch:'.length)) : 0n
  const floor = [BigInt(text(around[0]?.['entry'] ?? '0')), anchor, fork?.position ?? 0n].reduce(
    (most, value) => (value > most ? value : most),
  )
  return {
    rows: String(rows),
    next: around[1] === undefined ? null : roleOf(text(around[1]['message'])),
    current,
    running: source.running,
    floor: String(floor),
    tail,
  }
}

/** Writes what a create with a source starts its session from: nothing for any other command. */
export function startFork(port: Executor, scope: Scope, command: SessionCommand): void {
  const fork = command.kind === 'create' ? command.input.creation.fork : undefined
  if (fork === undefined) return
  const source = { tenant: scope.tenant, session: fork.source }
  const epoch = fork.point.epoch.slice(modelViewPrefix(scope.tenant, fork.source).length)
  const upper = BigInt(fork.point.upper)
  const head = oneRow(
    port,
    'SELECT origin FROM sl_compaction_head WHERE tenant = ? AND session = ? LIMIT 1',
    [source.tenant, source.session],
  )
  if (head === undefined) throw new SegmentUnreadable('the source of a fork has no compaction head')
  port.execute(
    'INSERT INTO sl_fork (tenant, session, src_session, src_epoch, upper, position, origin) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      scope.tenant,
      scope.session,
      fork.source,
      epoch,
      upper,
      BigInt(fork.point.position),
      text(head['origin']),
    ],
  )
  const flat: Readonly<{ upto: bigint; session: string; epoch: string }>[] = []
  for (const piece of segmentsOf(port, source, epoch)) {
    if (piece.upto === null || (flat.at(-1)?.upto ?? 0n) >= upper) continue
    flat.push({ ...piece, upto: piece.upto < upper ? piece.upto : upper })
  }
  if ((flat.at(-1)?.upto ?? 0n) < upper) flat.push({ upto: upper, session: fork.source, epoch })
  for (const piece of flat)
    port.execute(
      'INSERT INTO sl_view_segment (tenant, session, epoch, upto, src_session, src_epoch) VALUES (?, ?, ?, ?, ?, ?)',
      [scope.tenant, scope.session, FIRST_EPOCH, piece.upto, piece.session, piece.epoch],
    )
}
