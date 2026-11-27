import {
  ask,
  CATALOG,
  candidates,
  list,
  catalogContract,
  find,
  report,
  standingOf,
  tree,
  type Contract,
  type Placed,
  type Registry,
  type Scope,
  type TreeNode,
} from '@omne-harness/dynamis'
import type { Admission } from './port.ts'
import { pointLines, rulesOf, type Form } from './rules.ts'
import { columns, cut, insideText, moreLine, placeOf, scopeText, stateText } from './text.ts'

/** The server side of the tree as the asker sees it. */
export function serverSide(
  registry: Registry,
  scope: Scope,
): { side: TreeNode; problems: string[] } {
  const whole = tree(registry, scope)
  const side = find(whole.root, 'server') as TreeNode
  const problems = whole.problems.map(
    problem => `set aside: ${problem.point} (${problem.kind}: ${problem.detail})`,
  )
  return { side, problems }
}

const all = (node: TreeNode): TreeNode[] => [node, ...node.children.flatMap(all)]

/** The first host or point of that name on the side. */
export const serverNode = (side: TreeNode, name: string): TreeNode | undefined =>
  all(side).find(node => (node.kind === 'host' || node.kind === 'point') && node.label === name)

/** The declared points the asker sees on the server side, each with its contract. */
export function serverPoints(registry: Registry, scope: Scope): Map<string, Contract> {
  const points = new Map<string, Contract>()
  for (const node of all(serverSide(registry, scope).side))
    if (node.kind === 'point' && !points.has(node.label)) {
      const standing = standingOf(registry, node.label, scope)
      if (standing.kind === 'declared') points.set(node.label, standing.contract)
    }
  return points
}

type Cut = TreeNode & Readonly<{ inside?: number }>
const rebuild = (node: Cut, children: readonly Cut[], inside: number): Cut => ({
  ...node,
  children,
  inside,
})

/** An entry's note ends with its scope as the registry wrote it; it is named instead of printed raw. */
function namedNote(note: string, asker: Scope): string {
  for (let at = asker.length; at > 0; at -= 1) {
    const raw = `@${asker.slice(0, at).join('/')}`
    if (note.endsWith(raw))
      return `${note.slice(0, -raw.length)}${scopeText(asker.slice(0, at), asker)}`
  }
  return `${note}, ${scopeText([], asker)}`
}

function rowsOf(node: Cut, indent: string, summaries: ReadonlyMap<string, string>, asker: Scope) {
  const note = node.kind === 'entry' ? namedNote(node.note, asker) : node.note
  const bracket = note === '' ? '' : `[${note}]`
  const cells =
    node.kind === 'point'
      ? [`${indent}${node.label}`, 'point', summaries.get(node.label) ?? '', bracket]
      : [`${indent}${node.label}${bracket === '' ? '' : `  ${bracket}`}`]
  const last = cells.length - 1
  cells[last] = `${cells[last]}${insideText(node.inside ?? 0)}`
  const rows: string[][] = [cells]
  for (const child of node.children) rows.push(...rowsOf(child, `${indent}  `, summaries, asker))
  return rows
}

export function serverTreeLines(
  registry: Registry,
  scope: Scope,
  under: string | undefined,
  depth: number | undefined,
): string[] | undefined {
  const { side, problems } = serverSide(registry, scope)
  const top = under === undefined ? side : serverNode(side, under)
  if (top === undefined) return undefined
  const summaries = new Map([[CATALOG, catalogContract.summary]])
  for (const [name, contract] of serverPoints(registry, scope))
    summaries.set(name, contract.summary)
  const { node, hidden } = cut<Cut>(top, depth, rebuild)
  const lines = columns(rowsOf(node, under === undefined ? '' : '  ', summaries, scope))
  if (under !== undefined) lines.unshift('server')
  if (hidden > 0) lines.push(moreLine(hidden, top.label, depth as number))
  return under === undefined ? [...lines, ...problems.map(line => `  ${line}`)] : lines
}

function receiptOf(registry: Registry, entry: Placed): string {
  const effect = report(registry, entry.instance).find(one => one.entry === entry)
  return effect === undefined ? 'not in effect' : stateText(effect.state, effect.detail)
}

function placedLines(registry: Registry, name: string, scope: Scope): string[] {
  const read = candidates(registry, name, null, scope)
  if (read.kind !== 'read') return [`  cannot be read now: ${read.reason} ${read.detail}`]
  const rows = [
    ...read.entries.map(entry => ({ entry, state: receiptOf(registry, entry) })),
    ...read.filtered.map(out => ({
      entry: out.entry,
      state: stateText(out.reason === 'overridden' ? 'breach' : out.reason, out.detail),
    })),
  ]
  if (rows.length === 0) return ['  (nothing placed)']
  return rows.map(
    ({ entry, state }) =>
      `  ${placeOf(entry.key, entry.id) || '(no key)'}   ${entry.instance.fiber}#${entry.instance.generation} ${scopeText(entry.scope, scope)}   [${state}]`,
  )
}

const GUEST_FORMS = 'plugin.guest-forms'
const PORTS = 'plugin.ports'
const SERVER_HANDED = ['ports']

function formOf(registry: Registry, name: string): Form | undefined {
  const answer = ask<Partial<Form>>(registry, GUEST_FORMS, name, [])
  if (answer.kind !== 'one') return undefined
  const { gives, example } = answer.entry.item
  return typeof gives === 'string' && typeof example === 'string' ? { gives, example } : undefined
}

type Method = Readonly<{ takes: string; answers: string }>

function portLines(registry: Registry, scope: Scope): string[] {
  const read = list<{ methods?: Readonly<Record<string, Method>> }>(registry, PORTS, null, scope)
  if (read.kind !== 'read') return [`ports: cannot be read now: ${read.reason} ${read.detail}`]
  return [
    'a plugin asks for a port by its key, under needs on its server side: "server": { "needs": ["<key>"], "members": [...] }',
    'its code then calls await ports["<key>"].<method>(input); a port it did not ask for is not there',
    'ports lent now, with what each method takes and answers:',
    ...read.items.flatMap(({ entry }) => [
      `  ${entry.key}`,
      ...Object.entries(entry.item.methods ?? {}).flatMap(([method, told]) => [
        `    ${method}   takes: ${told.takes}`,
        `    ${' '.repeat(method.length)}   answers: ${told.answers}`,
      ]),
    ]),
  ]
}

/** One server point in full, read from its contract and from what the asker sees placed on it. */
export function serverPointLines(
  registry: Registry,
  contract: Contract,
  scope: Scope,
  admission?: Admission,
): string[] {
  const rules = rulesOf(contract)
  const head = { name: contract.name, side: contract.tree, summary: contract.summary }
  return [
    ...pointLines(head, rules, admission, formOf(registry, contract.name), SERVER_HANDED),
    ...(contract.name === PORTS ? portLines(registry, scope) : []),
    'now:',
    ...placedLines(registry, contract.name, scope),
  ]
}

/** Whether a form is given for this server point: the loader judges with it. */
export const serverForm = (registry: Registry, name: string): boolean =>
  formOf(registry, name) !== undefined
