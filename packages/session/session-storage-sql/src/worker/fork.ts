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
  inherited: bigint
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
    inherited,
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

/** Where an entry position of the chain of a session lives: the chain is read once, two steps up at most. */
export function entryOwners(port: Executor, scope: Scope): (position: bigint) => string {
  const chain: Readonly<{ session: string; above: bigint }>[] = []
  let session = scope.session
  for (let step = 0; step < 2; step += 1) {
    const fork = forkOf(port, { tenant: scope.tenant, session })
    if (fork === undefined) break
    chain.push({ session, above: fork.position })
    session = fork.source
  }
  const root = session
  return position => chain.find(link => position > link.above)?.session ?? root
}

export const entrySession = (port: Executor, scope: Scope, position: bigint): string =>
  entryOwners(port, scope)(position)

const tailOf = (port: Executor, scope: Scope, fork: Fork | undefined): bigint => {
  const head = oneRow(
    port,
    'SELECT MAX(position) AS p FROM sl_entry WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  return head === undefined || head['p'] === null ? (fork?.position ?? 0n) : big(head['p'])
}

export const roleOf = (message: string): ForkFacts['next'] =>
  message.startsWith('{') ? (JSON.parse(message) as { role: ForkFacts['next'] }).role : 'compaction'

type Source = Readonly<{ session: string; epoch: string; running: boolean }>
const COUNT = /^[1-9][0-9]*$/u
const most = (values: readonly bigint[]): bigint =>
  values.reduce((left, right) => (right > left ? right : left))

/** No entry of the rows up to the point lies above: its last entry, the summary of the epoch, the fork. */
function floorOf(last: Row | undefined, epoch: string, fork: Fork | undefined): bigint {
  const anchor = COUNT.test(epoch.slice('epoch:'.length))
    ? BigInt(epoch.slice('epoch:'.length))
    : 0n
  return most([BigInt(text(last?.['entry'] ?? '0')), anchor, fork?.position ?? 0n])
}

const originOfSource = (port: Executor, source: Scope): string => {
  const head = oneRow(
    port,
    'SELECT origin FROM sl_compaction_head WHERE tenant = ? AND session = ? LIMIT 1',
    [source.tenant, source.session],
  )
  if (head === undefined) throw new SegmentUnreadable('the source of a fork has no compaction head')
  return text(head['origin'])
}

export function forkFacts(
  port: Executor,
  tenant: string,
  source: Source,
  point: ForkPoint,
): ForkFacts | null {
  try {
    originOfSource(port, { tenant, session: source.session })
    return factsOf(port, tenant, source, point)
  } catch (error) {
    if (error instanceof SegmentUnreadable) return null
    throw error
  }
}

function factsOf(port: Executor, tenant: string, source: Source, point: ForkPoint): ForkFacts {
  const scope = { tenant, session: source.session }
  const fork = forkOf(port, scope)
  const tail = String(tailOf(port, scope, fork))
  const unknown = {
    rows: null,
    next: null,
    current: false,
    running: source.running,
    floor: '0',
    tail,
  }
  const prefix = modelViewPrefix(tenant, source.session)
  if (!point.epoch.startsWith(prefix)) return unknown
  const epoch = point.epoch.slice(prefix.length)
  const view = viewOf(port, scope, epoch)
  const rows = view.upper()
  const current = epoch === source.epoch
  if (rows === 0n && !current) return unknown
  const shown = { ...unknown, rows: String(rows), current }
  if (!COUNT.test(point.upper) || BigInt(point.upper) > rows) return shown
  const upper = BigInt(point.upper)
  const [last, next] = view.rows(upper - 1n, upper + 1n, 2, 'seq, entry, message')
  return {
    ...shown,
    next: next === undefined ? null : roleOf(text(next['message'])),
    floor: String(floorOf(last, epoch, fork)),
  }
}

type Flat = Readonly<{ upto: bigint; session: string; epoch: string }>
const least = (left: bigint, right: bigint): bigint => (left < right ? left : right)

function flattened(port: Executor, source: Scope, epoch: string, upper: bigint): Flat[] {
  const flat = segmentsOf(port, source, epoch).map(({ session, epoch: from, upto }) => ({
    session,
    epoch: from,
    upto: least(upto ?? upper, upper),
  }))
  const covered = flat.at(-1)?.upto ?? 0n
  return covered < upper ? [...flat, { upto: upper, session: source.session, epoch }] : flat
}

/** Writes what a create with a source starts its session from: nothing for any other command. */
export function startFork(port: Executor, scope: Scope, command: SessionCommand): void {
  const fork = command.kind === 'create' ? command.input.creation.fork : undefined
  if (fork === undefined) return
  const source = { tenant: scope.tenant, session: fork.source }
  const epoch = fork.point.epoch.slice(modelViewPrefix(scope.tenant, fork.source).length)
  const upper = BigInt(fork.point.upper)
  const origin = originOfSource(port, source)
  port.execute(
    'INSERT INTO sl_fork (tenant, session, src_session, src_epoch, upper, position, origin) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [scope.tenant, scope.session, fork.source, epoch, upper, BigInt(fork.point.position), origin],
  )
  for (const piece of flattened(port, source, epoch, upper))
    port.execute(
      'INSERT INTO sl_view_segment (tenant, session, epoch, upto, src_session, src_epoch) VALUES (?, ?, ?, ?, ?, ?)',
      [scope.tenant, scope.session, FIRST_EPOCH, piece.upto, piece.session, piece.epoch],
    )
}
