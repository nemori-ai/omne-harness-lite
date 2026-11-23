import {
  candidates,
  find,
  render,
  report,
  standingOf,
  tree,
  type Contract,
  type Placed,
  type Registry,
  type Scope,
  type TreeNode,
} from '@omne-harness/dynamis'
import { cut, moreLine, placeOf, scopeText, stateText } from './text.ts'

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

const rebuild = (node: TreeNode, children: readonly TreeNode[]): TreeNode => ({ ...node, children })

export function serverTreeLines(
  registry: Registry,
  scope: Scope,
  under: string | undefined,
  depth: number | undefined,
): string[] | undefined {
  const { side, problems } = serverSide(registry, scope)
  const top = under === undefined ? side : serverNode(side, under)
  if (top === undefined) return undefined
  const { node, hidden } = cut(top, depth, rebuild)
  const lines = under === undefined ? render(node).split('\n') : ['server', render(node, '  ')]
  if (hidden > 0) lines.push(moreLine(hidden, top.label, depth as number))
  return under === undefined ? [...lines, ...problems.map(line => `  ${line}`)] : lines
}

const ARITY: Readonly<Record<Contract['arity'], string>> = {
  one: 'one item',
  list: 'a list',
  'keyed-one': 'one per key',
  'keyed-list': 'a list per key',
}
const RESOLVE: Readonly<Record<Contract['resolve'], string>> = {
  conflict: 'two different items in one place are a conflict and neither is used',
  'most-specific':
    'among several, the most specific scope wins; two at the same scope are a conflict',
}
const ITEM: Readonly<Record<Contract['item']['kind'], string>> = {
  data: 'data',
  pure: 'a pure function',
  effect: 'a function with effects',
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
    ...read.filtered.map(out => ({ entry: out.entry, state: stateText('breach', out.detail) })),
  ]
  if (rows.length === 0) return ['  (nothing placed)']
  return rows.map(
    ({ entry, state }) =>
      `  ${placeOf(entry.key, entry.id) || '(no key)'}   ${entry.instance.fiber}#${entry.instance.generation}${scopeText(entry.scope) === '' ? '' : ` ${scopeText(entry.scope)}`}   [${state}]`,
  )
}

/** One server point in full, read from its contract and from what the asker sees placed on it. */
export function serverPointLines(registry: Registry, contract: Contract, scope: Scope): string[] {
  const keyed = contract.arity.startsWith('keyed')
  const fields = Object.entries(contract.item.fields).map(([field, kind]) => `${field} (${kind})`)
  return [
    `${contract.name}   point, ${contract.tree}   v${contract.version}.${contract.revision}`,
    contract.summary,
    keyed ? `key: ${contract.key}` : `key: none; the point holds ${ARITY[contract.arity]}`,
    ...(contract.keyFrom === null ? [] : [`keys from: ${contract.keyFrom}`]),
    `holds: ${ARITY[contract.arity]}; ${RESOLVE[contract.resolve]}`,
    `may change: ${contract.binding === 'run' ? 'while running' : 'only when the application is built'}`,
    `a member gives: ${ITEM[contract.item.kind]}${fields.length === 0 ? '' : `. fields: ${fields.join(', ')}`}`,
    `the host gives it: ${contract.gives}`,
    `when it throws: ${contract.onError}`,
    'now:',
    ...placedLines(registry, contract.name, scope),
  ]
}
