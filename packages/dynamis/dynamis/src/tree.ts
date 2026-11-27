import {
  CATALOG,
  candidates,
  catalogContract,
  report,
  standingOf,
  type Contract,
} from './catalog.ts'
import { visible } from './answer.ts'
import { byText, type Placed, type Registry, type Scope } from './registry.ts'

export type TreeNode = Readonly<{
  kind: 'root' | 'side' | 'host' | 'point' | 'key' | 'entry'
  label: string
  path: string
  note: string
  children: readonly TreeNode[]
}>

export type Problem = Readonly<{
  kind: 'cyclic' | 'orphan' | 'stray' | 'ambiguous'
  point: string
  detail: string
}>

export type Tree = Readonly<{ root: TreeNode; problems: readonly Problem[] }>

type Side = Contract['tree']
type Shown = Readonly<{ entries: readonly Placed[]; unread: string | null }>
type Sight = Readonly<{
  contracts: ReadonlyMap<string, Contract>
  shown: ReadonlyMap<string, Shown>
  states: ReadonlyMap<Placed, string>
  mounted: ReadonlyMap<string, readonly Contract[]>
}>

const hostOf = (name: string): string => name.slice(0, name.indexOf('.'))
const fibersOf = (entries: readonly Placed[]): string =>
  [...new Set(entries.map(entry => entry.instance.fiber))].sort().join(', ')
const tagOf = (entry: Placed): string => `${entry.instance.fiber}#${entry.instance.generation}`
const join = (path: string, part: string): string => `${path}/${part}`

/** Why a point cannot be placed: its keys come round to a point already passed, or from one not declared. */
function chainProblem(name: string, contracts: ReadonlyMap<string, Contract>): Problem | null {
  const passed = [name]
  for (let at = (contracts.get(name) as Contract).keyFrom; at !== null;) {
    const parent = at === CATALOG ? catalogContract : contracts.get(at)
    if (parent === undefined)
      return { kind: 'orphan', point: name, detail: `${at} is not declared` }
    passed.push(at)
    if (passed.indexOf(at) < passed.length - 1)
      return { kind: 'cyclic', point: name, detail: passed.join(' -> ') }
    at = parent.keyFrom
  }
  return null
}

function statesOf(registry: Registry): Map<Placed, string> {
  const states = new Map<Placed, string>()
  for (const instance of registry.serving)
    for (const effect of report(registry, instance))
      states.set(
        effect.entry,
        effect.detail === '' ? effect.state : `${effect.state}: ${effect.detail}`,
      )
  return states
}

function shownOf(registry: Registry, name: string, asker: Scope): Shown {
  const read = candidates(registry, name, null, asker)
  if (read.kind !== 'read') return { entries: [], unread: read.detail }
  const mine = new Set<Placed>([...read.entries, ...read.filtered.map(out => out.entry)])
  return { entries: registry.placed.filter(placed => mine.has(placed)), unread: null }
}

function entryNode(sight: Sight, entry: Placed, path: string): TreeNode {
  const named = entry.id !== ''
  const scope = entry.scope.length > 0 ? `@${entry.scope.join('/')}` : ''
  const notes = [sight.states.get(entry) as string, named ? tagOf(entry) : '', scope]
  const part = `${tagOf(entry)}${named ? `:${entry.id}` : ''}${scope}`
  return {
    kind: 'entry',
    label: named ? entry.id : tagOf(entry),
    path: join(path, part),
    note: notes.filter(note => note !== '').join(', '),
    children: [],
  }
}

const entriesOf = (sight: Sight, contract: Contract): readonly Placed[] =>
  (sight.shown.get(contract.name) as Shown).entries

const keysOf = (sight: Sight, contract: Contract): Set<string> =>
  new Set([
    ...entriesOf(sight, contract).map(entry => entry.key),
    ...(sight.mounted.get(contract.name) ?? []).flatMap(child => [...keysOf(sight, child)]),
  ])

/** What hangs below one key of a point: its entries there, then the points keyed from it that hold something there. */
function below(
  sight: Sight,
  contract: Contract,
  key: string,
  path: string,
  side: Side,
): TreeNode[] {
  const entries = entriesOf(sight, contract).filter(entry => entry.key === key)
  const children = (sight.mounted.get(contract.name) ?? []).filter(child =>
    keysOf(sight, child).has(key),
  )
  return [
    ...entries.map(entry => entryNode(sight, entry, path)),
    ...children.map(child => pointNode(sight, child, key, path, side)),
  ]
}

function pointNode(
  sight: Sight,
  contract: Contract,
  key: string | null,
  parent: string,
  side: Side,
): TreeNode {
  const path = join(parent, contract.name)
  const { unread } = sight.shown.get(contract.name) as Shown
  const notes = [
    contract.arity,
    contract.tree === side ? '' : contract.tree,
    contract.binding === 'build' ? 'build' : '',
    contract.version === 1 && contract.revision === 1
      ? ''
      : `v${contract.version}.${contract.revision}`,
    contract.keys === 'public' ? 'public keys' : '',
    contract.scopes === undefined || contract.scopes === 'all'
      ? ''
      : `closed: ${contract.scopes.why}`,
  ]
  if (unread !== null) notes.push(`unread: ${unread}`)
  const keyed = contract.arity.startsWith('keyed')
  const children =
    key !== null || !keyed
      ? below(sight, contract, key ?? '', path, side)
      : [...keysOf(sight, contract)].sort(byText).map((each): TreeNode => ({
          kind: 'key',
          label: each,
          path: join(path, each),
          note: '',
          children: below(sight, contract, each, join(path, each), side),
        }))
  return {
    kind: 'point',
    label: contract.name,
    path,
    note: notes.filter(note => note !== '').join(', '),
    children,
  }
}

function sideNode(sight: Sight, side: Side): TreeNode {
  const roots = [...sight.contracts.values()].filter(
    contract => contract.keyFrom === null && contract.tree === side,
  )
  const hosts = [...new Set(roots.map(contract => hostOf(contract.name)))].sort(byText)
  return {
    kind: 'side',
    label: side,
    path: side,
    note: '',
    children: hosts.map((host): TreeNode => ({
      kind: 'host',
      label: host,
      path: join(side, host),
      note: '',
      children: roots
        .filter(contract => hostOf(contract.name) === host)
        .map(contract => pointNode(sight, contract, null, join(side, host), side)),
    })),
  }
}

const declarationsOf = (seen: readonly Placed[], name: string): Placed[] =>
  seen.filter(placed => placed.point === CATALOG && placed.key === name)

/** One point as the asker sees it: its contract, or the reason it is set aside, or nothing to say. */
function pointOf(
  registry: Registry,
  seen: readonly Placed[],
  name: string,
  asker: Scope,
): Contract | Problem | null {
  const standing = standingOf(registry, name, asker)
  if (standing.kind === 'declared') return standing.contract
  if (standing.kind === 'ambiguous')
    return { kind: 'ambiguous', point: name, detail: fibersOf(declarationsOf(seen, name)) }
  const here = seen.filter(placed => placed.point === name)
  return standing.kind === 'undeclared' && here.length > 0
    ? { kind: 'stray', point: name, detail: fibersOf(here) }
    : null
}

function mountedOf(contracts: ReadonlyMap<string, Contract>): Map<string, Contract[]> {
  const mounted = new Map<string, Contract[]>()
  for (const contract of contracts.values())
    if (contract.keyFrom !== null)
      mounted.set(contract.keyFrom, [...(mounted.get(contract.keyFrom) ?? []), contract])
  return mounted
}

/** The points an asker can see, with what cannot be placed on the tree set aside as problems. */
function survey(registry: Registry, asker: Scope): { sight: Sight; problems: Problem[] } {
  const seen = registry.placed.filter(
    placed => visible(placed.scope, asker) && registry.serving.includes(placed.instance),
  )
  const names = new Set(seen.map(placed => (placed.point === CATALOG ? placed.key : placed.point)))
  const declared = new Map<string, Contract>()
  const problems: Problem[] = []
  for (const name of names) {
    const found = pointOf(registry, seen, name, asker)
    if (found !== null && 'kind' in found) problems.push(found)
    else if (found !== null) declared.set(name, found)
  }
  const contracts = new Map<string, Contract>([[CATALOG, catalogContract]])
  for (const [name, contract] of declared) {
    const problem = chainProblem(name, declared)
    if (problem === null) contracts.set(name, contract)
    else problems.push(problem)
  }
  const shown = new Map([...contracts.keys()].map(name => [name, shownOf(registry, name, asker)]))
  const sight = { contracts, shown, states: statesOf(registry), mounted: mountedOf(contracts) }
  return { sight, problems: problems.sort((left, right) => byText(left.point, right.point)) }
}

export function tree(registry: Registry, asker: Scope): Tree {
  const { sight, problems } = survey(registry, asker)
  const children = [sideNode(sight, 'server'), sideNode(sight, 'client')]
  return { root: { kind: 'root', label: 'system', path: '', note: '', children }, problems }
}

export function find(node: TreeNode, path: string): TreeNode | undefined {
  if (node.path === path) return node
  const next = node.children.find(child => path === child.path || path.startsWith(`${child.path}/`))
  return next === undefined ? undefined : find(next, path)
}

export function render(node: TreeNode, indent = ''): string {
  const head = `${indent}${node.label}${node.note === '' ? '' : `  [${node.note}]`}`
  return [head, ...node.children.map(child => render(child, `${indent}  `))].join('\n')
}
