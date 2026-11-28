import type { Admission, ClientPoint, ClientTree, Depth } from './port.ts'
import { dataKeyLines, pointLines, pointText } from './rules.ts'
import { columns, cut, insideText, moreLine } from './text.ts'

type Part = ClientTree['parts'][number]
type Row = Readonly<{
  name: string
  cells: readonly string[]
  children: readonly Row[]
  inside?: number
}>

/** The point a depth of a part is changed on: its keys come from another point and its one field is named for the depth. */
function depthPoint(client: ClientTree, depth: Depth): ClientPoint | undefined {
  return client.points.find(({ contract }) => {
    const fields = contract?.item.fields ?? []
    return contract?.keyFrom !== null && fields.length === 1 && fields[0]?.name === depth
  })
}

const DEPTHS: readonly Depth[] = ['tokens', 'style', 'render']

export const hostOf = (name: string): string =>
  name.slice(0, Math.max(0, name.indexOf('.'))) || name
const byName = (left: { name: string }, right: { name: string }): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0

function partRow(client: ClientTree, part: Part): Row {
  const inner = client.parts.filter(other => other.within === part.name).sort(byName)
  return {
    name: part.name,
    cells: ['part', part.label, DEPTHS.filter(depth => part.depths.includes(depth)).join(' ')],
    children: inner.map(other => partRow(client, other)),
  }
}

/** The hosts of a client: under each, its outermost parts nesting the inner ones, then its points. */
function hostRows(client: ClientTree): Row[] {
  const names = new Set(client.parts.map(part => part.name))
  const outer = client.parts.filter(part => part.within === null || !names.has(part.within))
  const hosts = [...new Set([...outer, ...client.points].map(item => hostOf(item.name)))].sort()
  return hosts.map(host => ({
    name: host,
    cells: [],
    children: [
      ...outer
        .filter(part => hostOf(part.name) === host)
        .sort(byName)
        .map(part => partRow(client, part)),
      ...client.points
        .filter(point => hostOf(point.name) === host)
        .sort(byName)
        .map(point => ({
          name: point.name,
          cells: [
            'point',
            point.summary,
            ...(point.contract?.scopes === undefined
              ? []
              : [`[closed: ${point.contract.scopes.why}]`]),
          ],
          children: [],
        })),
    ],
  }))
}

function flat(row: Row, indent: string): string[][] {
  const cells = [`${indent}${row.name}`, ...row.cells]
  const last = cells.length - 1
  cells[last] = `${cells[last]}${insideText(row.inside ?? 0)}`
  return [cells, ...row.children.flatMap(child => flat(child, `${indent}  `))]
}

const all = (rows: readonly Row[]): Row[] => rows.flatMap(row => [row, ...all(row.children)])
const rebuild = (row: Row, children: readonly Row[], inside: number): Row => ({
  ...row,
  children,
  inside,
})

export const NONE_CONNECTED =
  'client   none connected. The client tree exists only while a client is connected; the server tree is under side=server.'

/** One client's tree: a head line, the hosts with their parts and points, and the plugins it reported. */
export function clientTreeLines(
  client: ClientTree,
  under: string | undefined,
  depth: number | undefined,
): string[] | undefined {
  const top: Row = {
    name: `client   ${client.client}, connected`,
    cells: [],
    children: hostRows(client),
  }
  const start = under === undefined ? top : all(top.children).find(row => row.name === under)
  if (start === undefined) return undefined
  const { node, hidden } = cut(start, depth, rebuild)
  const lines =
    under === undefined
      ? [node.name, ...columns(node.children.flatMap(row => flat(row, '  ')))]
      : [top.name, ...columns(flat(node, '  '))]
  if (hidden > 0)
    lines.push(moreLine(hidden, start === top ? 'client' : start.name, depth as number))
  if (under !== undefined) return lines
  const plugins = client.plugins.map(plugin => [
    `  plugin ${plugin.name}`,
    plugin.version,
    `${plugin.state}${plugin.reason === null ? '' : `: ${plugin.reason}`}`,
  ])
  return [...lines, ...columns(plugins)]
}

export const clientNames = (client: ClientTree): string[] => [
  ...client.parts.map(part => part.name),
  ...client.points.map(point => point.name),
]

function within(client: ClientTree, part: Part): string[] {
  const labels: string[] = []
  const passed = new Set([part.name])
  for (let at = part.within; at !== null && !passed.has(at);) {
    const outer = client.parts.find(other => other.name === at)
    if (outer === undefined) break
    labels.unshift(outer.label)
    passed.add(at)
    at = outer.within
  }
  return labels
}

/** The member the point of a depth gives to copy, keyed to this part, and the lines that follow it; none when its example has no key to set. */
function copied(point: ClientPoint | undefined, part: string): string[] | undefined {
  const [first, ...rest] = (point?.form?.example ?? point?.contract?.example)?.split('\n') ?? []
  if (first === undefined) return undefined
  try {
    const member: unknown = JSON.parse(first)
    if (typeof member !== 'object' || member === null || Array.isArray(member)) return undefined
    if (!('key' in member)) return undefined
    return [JSON.stringify({ ...member, key: part }), ...rest]
  } catch {
    return undefined
  }
}

export function partLines(client: ClientTree, part: Part): string[] {
  const path = within(client, part)
  const open = DEPTHS.filter(depth => part.depths.includes(depth)).map(depth => {
    const point = depthPoint(client, depth)
    const name = point?.name ?? ''
    const fallback =
      point === undefined
        ? `none: no point on this client takes the depth ${depth} now`
        : `{"point":"${name}","key":"${part.name}"}: OmneExtensionPoints show ${name} says what a member gives`
    const [member = fallback, ...rest] = copied(point, part.name) ?? []
    const keys = depth === 'tokens' ? point?.dataKeys : undefined
    const names =
      keys === undefined
        ? []
        : [
            `    names: OmneExtensionPoints show ${name} lists the ${keys.length} token names and their values now.`,
          ]
    const kind = point?.contract?.item.kind
    const gives = kind === undefined ? '—' : kind === 'data' ? 'data' : 'code'
    return { depth, gives, member, after: [...rest.map(line => `    ${line}`), ...names] }
  })
  const rows = columns(
    open.map(({ depth, gives, member }) => [`  ${depth}`, gives, `member: ${member}`]),
  )
  return [
    `${part.name}   part, client   ${part.label}`,
    part.summary,
    ...(path.length === 0 ? [] : [`in: ${path.join(' › ')}`]),
    'depths, shallow first:',
    ...open.flatMap(({ after }, at) => [rows[at] as string, ...after]),
  ]
}

/** A client point: its rules in the form a server point has when it reports them; a client does not report what it holds. */
export function clientPointLines(
  point: ClientPoint,
  handed?: readonly string[],
  admission?: Admission,
): string[] {
  if (point.contract === undefined) return [`${point.name}   point, client`, point.summary]
  const head = { name: point.name, side: 'client', summary: point.summary }
  return [
    ...pointLines(head, point.contract, admission, point.form, handed),
    ...(point.dataKeys === undefined ? [] : dataKeyLines(point.dataKeys)),
  ]
}

/** The rows find matches against, from every connected client, the first client naming each. */
export function clientCandidates(clients: readonly ClientTree[]) {
  const seen = new Map<string, Readonly<{ text: string; cells: readonly string[] }>>()
  for (const client of clients) {
    for (const part of client.parts)
      if (!seen.has(part.name))
        seen.set(part.name, {
          text: [part.name, part.label, part.summary].join(' '),
          cells: [
            'part',
            `${part.label} — ${part.summary}`,
            `depths: ${DEPTHS.filter(depth => part.depths.includes(depth)).join(' ')}`,
            'client',
          ],
        })
    for (const point of client.points)
      if (!seen.has(point.name))
        seen.set(point.name, {
          text: pointText(point.name, point.summary, point.contract, point.dataKeys),
          cells: ['point', point.summary, '', 'client'],
        })
  }
  return seen
}
