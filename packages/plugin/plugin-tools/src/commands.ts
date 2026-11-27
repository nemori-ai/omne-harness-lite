import { visible, type Registry, type Scope } from '@omne-harness/dynamis'
import {
  NONE_CONNECTED,
  clientCandidates,
  clientNames,
  clientPointLines,
  clientTreeLines,
  hostOf,
  partLines,
} from './client.ts'
import type { ClientTree, ExtensionSight } from './port.ts'
import type { ArgumentsOf, ExtensionPointsCommandName } from './protocol.ts'
import { CANNOT_READ, done, invalid, unavailable, type Answer } from './results.ts'
import type { TreeChange } from './revisions.ts'
import { pointText, rulesOf } from './rules.ts'
import { serverForm, serverPointLines, serverPoints, serverTreeLines } from './server.ts'
import { columns, nearest, placeOf, scopeText, score, stateText } from './text.ts'

type Side = 'server' | 'client'
type Seen = Readonly<{
  server: Registry | 'unavailable'
  clients: readonly ClientTree[] | 'unavailable'
}>

/** What the port answers now. A read that throws has no basis: it is unavailable, never empty. */
function seen(sight: ExtensionSight): Seen {
  const attempt = <T>(read: () => T): T | 'unavailable' => {
    try {
      return read()
    } catch {
      return 'unavailable'
    }
  }
  return { server: attempt(() => sight.server()), clients: attempt(() => sight.clients()) }
}

const wants = (asked: Side | undefined, side: Side): boolean =>
  asked === undefined || asked === side
const NEITHER = 'neither extension tree can be read now; nothing was read'

/** Why a name is not found, with the names closest to it now and the trees that could not be read. */
function notFound(what: string, asked: string, names: Iterable<string>, read: Seen): Answer {
  const close = nearest(asked, names)
  const blind = (['server', 'client'] as const).filter(side =>
    side === 'server' ? read.server === 'unavailable' : read.clients === 'unavailable',
  )
  return invalid(
    [
      `there is no ${what} "${asked}" now.`,
      close.length === 0 ? 'Nothing is named now.' : `Nearest: ${close.join(', ')}.`,
      ...blind.map(side => `The ${side} tree cannot be read now, so it may be there.`),
      'tree lists every name.',
    ].join(' '),
  )
}

export type Handler<K extends ExtensionPointsCommandName> = (
  sight: ExtensionSight,
  params: ArgumentsOf<K>['params'],
) => Answer

const tree: Handler<'tree'> = (sight, { side, under, depth }) => {
  const read = seen(sight)
  const lines: string[] = []
  let readable = 0
  let found = under === undefined
  const names: string[] = []
  if (wants(side, 'server')) {
    if (read.server === 'unavailable') lines.push(`server   ${CANNOT_READ}`)
    else {
      readable += 1
      const shown = serverTreeLines(read.server, sight.scope, under, depth)
      if (shown !== undefined) found = true
      lines.push(...(shown ?? []))
      names.push(...serverPoints(read.server, sight.scope).keys())
    }
  }
  if (wants(side, 'client')) {
    if (read.clients === 'unavailable') lines.push(`client   ${CANNOT_READ}`)
    else {
      readable += 1
      if (read.clients.length === 0) lines.push(NONE_CONNECTED)
      for (const client of read.clients) {
        const shown = clientTreeLines(client, under, depth)
        if (shown !== undefined) found = true
        lines.push(...(shown ?? []))
        names.push(...clientNames(client))
      }
    }
  }
  if (readable === 0) return unavailable('tree', NEITHER)
  if (!found) return notFound('host, point or part', under as string, names, read)
  return done('tree', lines, sight.revisions.current())
}

const FIND_LIMIT = 20
const MORE_HOSTS = 8
const WALK =
  'Walk the tree instead: tree with depth 1 lists the hosts; then tree with under set to one of them.'

const find: Handler<'find'> = (sight, { query, side, limit = FIND_LIMIT }) => {
  const read = seen(sight)
  const lines: string[] = []
  const rows = new Map<string, Readonly<{ text: string; cells: readonly string[] }>>()
  let readable = 0
  if (wants(side, 'server')) {
    if (read.server === 'unavailable') lines.push(`server   ${CANNOT_READ}`)
    else {
      readable += 1
      for (const [name, contract] of serverPoints(read.server, sight.scope))
        rows.set(name, {
          text: pointText(name, contract.summary, rulesOf(contract)),
          cells: ['point', contract.summary, '', 'server'],
        })
    }
  }
  if (wants(side, 'client')) {
    if (read.clients === 'unavailable') lines.push(`client   ${CANNOT_READ}`)
    else {
      readable += 1
      for (const [name, row] of clientCandidates(read.clients))
        if (!rows.has(name)) rows.set(name, row)
    }
  }
  if (readable === 0) return unavailable('find', NEITHER)
  const hits = [...rows]
    .map(([name, row]) => ({ name, row, score: score(query, row.text) }))
    .filter(hit => hit.score > 0)
    .sort((left, right) => right.score - left.score || (left.name < right.name ? -1 : 1))
  if (hits.length === 0) lines.push(`nothing matches "${query}".`, WALK)
  else {
    lines.push(...columns(hits.slice(0, limit).map(hit => [hit.name, ...hit.row.cells])))
    const rest = hits.slice(limit)
    const hosts = [...new Set(rest.map(hit => hostOf(hit.name)))].sort().slice(0, MORE_HOSTS)
    lines.push(
      rest.length === 0
        ? `${hits.length} found.`
        : `${rest.length} more match. Narrow the words, or walk the tree under: ${hosts.join(', ')}.`,
    )
  }
  return done('find', lines, sight.revisions.current())
}

const show: Handler<'show'> = (sight, { name }) => {
  const read = seen(sight)
  if (read.server === 'unavailable' && read.clients === 'unavailable')
    return unavailable('show', NEITHER)
  const blocks: string[][] = []
  const names: string[] = []
  if (read.server !== 'unavailable') {
    const points = serverPoints(read.server, sight.scope)
    const contract = points.get(name)
    if (contract !== undefined) {
      const form = serverForm(read.server, name)
      const admission = sight.admission?.('server', name, rulesOf(contract), form)
      blocks.push(serverPointLines(read.server, contract, sight.scope, admission))
    }
    names.push(...points.keys())
  }
  if (read.clients !== 'unavailable') {
    const part = read.clients.flatMap(client =>
      client.parts.filter(one => one.name === name).map(one => partLines(client, one)),
    )[0]
    const owner = read.clients.find(client => client.points.some(one => one.name === name))
    const point = owner?.points.find(one => one.name === name)
    if (part !== undefined) blocks.push(part)
    else if (point !== undefined) {
      const admission =
        point.contract === undefined
          ? undefined
          : sight.admission?.('client', name, point.contract, point.form !== undefined)
      blocks.push(clientPointLines(point, owner?.handed, admission))
    }
    names.push(...read.clients.flatMap(clientNames))
  }
  if (blocks.length === 0) return notFound('point or part', name, names, read)
  return done('show', blocks.flat(), sight.revisions.current())
}

function changeRow(change: TreeChange, asker: Scope): string[] {
  const by = `${change.by} ${scopeText(change.scope, asker)}`
  const place = placeOf(change.point, change.key, change.id)
  if (change.kind === 'point')
    return change.sign === '+'
      ? [
          '  + point',
          change.point,
          change.side ?? '',
          `declared by ${by}`,
          `(show ${change.point} for its rules)`,
        ]
      : ['  - point', change.point, change.side ?? '', `declared by ${by}`]
  if (change.kind === 'placed')
    return change.sign === '+'
      ? ['  + placed', place, by, `[${stateText(change.after, change.detail)}]`]
      : ['  - placed', place, by, `[was ${stateText(change.before)}]`]
  return [
    '  ~ state',
    place,
    by,
    `${stateText(change.before)} → ${stateText(change.after, change.detail)}`,
  ]
}

const changes: Handler<'changes'> = (sight, { since }) => {
  const revision = sight.revisions.current()
  if (since === undefined)
    return done(
      'changes',
      [
        `now at ${revision}. Give since=<a revision you saw> to list what appeared, went away or changed state after it.`,
      ],
      revision,
    )
  const found = sight.revisions.since(since)
  if (found === 'unknown')
    return done(
      'changes',
      [
        `${since} is not known: it is from before this server started, or older than the revisions kept. The tree as it is now: use tree.`,
      ],
      revision,
    )
  const mine = found.filter(change => visible(change.scope, sight.scope))
  const rows = columns(mine.map(change => changeRow(change, sight.scope)))
  return done(
    'changes',
    [`since ${since}:`, ...(rows.length === 0 ? ['  nothing changed'] : rows)],
    revision,
  )
}

export type Reading = Exclude<ExtensionPointsCommandName, 'help'>
export const HANDLERS: { readonly [K in Reading]: Handler<K> } = { tree, find, show, changes }
