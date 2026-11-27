import {
  exactlyOne,
  listed,
  mostSpecific,
  opened,
  unlocked,
  visible,
  type Answer,
  type Filtered,
  type Listing,
  type Unavailable,
} from './answer.ts'
import {
  byInstance,
  isPointName,
  placedBy,
  standing,
  type Entry,
  type Instance,
  type Placed,
  type Registry,
  type Scope,
} from './registry.ts'

export const CATALOG = 'dynamis.points'

const FIELD_KINDS = ['string', 'number', 'boolean', 'function', 'object', 'array'] as const
const TREES = ['server', 'client'] as const
const ARITIES = ['one', 'list', 'keyed-one', 'keyed-list'] as const
const ITEM_KINDS = ['data', 'pure', 'effect'] as const
const RESOLVES = ['conflict', 'most-specific'] as const
const BINDINGS = ['build', 'run'] as const
const KEYS = ['private', 'public'] as const
const WHYS = [
  'no-tenant',
  'one-per-process',
  'grants-itself',
  'judges-or-records',
  'speaks-as-system',
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

export type Scopes =
  | 'all'
  | Readonly<{ only: 'deployment'; why: (typeof WHYS)[number]; note: string }>

export type Contract = Readonly<{
  name: string
  tree: (typeof TREES)[number]
  arity: (typeof ARITIES)[number]
  keyFrom: string | null
  key: string
  gives: string
  item: Readonly<{ kind: (typeof ITEM_KINDS)[number]; fields: Readonly<Record<string, FieldKind>> }>
  resolve: (typeof RESOLVES)[number]
  binding: (typeof BINDINGS)[number]
  onError: string
  version: number
  revision: number
  /** Whether the keys now on this point are told to the other tree. It tells nothing of the items. */
  keys: (typeof KEYS)[number]
  conformance: string | null
  scopes?: Scopes
  summary: string
  /** One item of this point as its author writes it, to copy. The registry does not read it. */
  example?: string
}>

export const catalogContract: Contract = Object.freeze({
  name: CATALOG,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of the declared point, <host>.<name>',
  gives: 'nothing: a declaration is data',
  item: Object.freeze({ kind: 'data', fields: Object.freeze({ name: 'string', item: 'object' }) }),
  resolve: 'conflict',
  binding: 'run',
  onError: 'a point whose declaration cannot be read answers unavailable',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'The catalog: one item declares one extension point and carries its contract.',
})

export type PointStanding =
  | Readonly<{ kind: 'declared'; contract: Contract; holders: readonly Instance[] }>
  | Readonly<{ kind: 'undeclared' }>
  | Readonly<{ kind: 'ambiguous'; by: readonly Instance[] }>
  | Readonly<{ kind: 'unreadable'; source: string }>

export type Candidates<I = unknown> =
  | Readonly<{
      kind: 'read'
      contract: Contract
      entries: readonly Placed<I>[]
      filtered: readonly Filtered<I>[]
    }>
  | Unavailable

export type Effect = Readonly<{
  entry: Placed
  state:
    | 'effective'
    | 'point-absent'
    | 'point-ambiguous'
    | 'unread'
    | 'breach'
    | 'closed'
    | 'locked'
    | 'conflict'
    | 'retiring'
  detail: string
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** JSON with the keys of every object in order, so equal contracts have equal digests. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map(key => [key, inner[key]]),
        )
      : inner,
  )

export function declare(contract: Contract, scope: Scope = []): Entry<Contract> {
  return {
    point: CATALOG,
    key: contract.name,
    id: '',
    scope,
    rank: 0,
    digest: canonical(contract),
    item: contract,
  }
}

export const withdrawOf = (contract: Contract): 'immediate' | 'drain' =>
  contract.item.kind === 'effect' ? 'drain' : 'immediate'

const isOneOf = (allowed: readonly string[], value: unknown): boolean =>
  allowed.includes(value as string)

function itemProblem(item: unknown): string | null {
  if (!isRecord(item) || !isOneOf(ITEM_KINDS, item['kind'])) return 'the item kind is unknown'
  const fields = item['fields']
  if (!isRecord(fields)) return 'the item fields are not an object'
  const bad = Object.keys(fields).find(field => !isOneOf(FIELD_KINDS, fields[field]))
  return bad === undefined ? null : `the kind of field ${bad} is unknown`
}

const isText = (value: unknown): boolean => typeof value === 'string'

const isScopes = (value: unknown): boolean =>
  value === undefined ||
  value === 'all' ||
  (isRecord(value) &&
    Object.keys(value).length === 3 &&
    value['only'] === 'deployment' &&
    isOneOf(WHYS, value['why']) &&
    typeof value['note'] === 'string' &&
    value['note'].trim() !== '')

export const closedBy = (contract: Contract): string | undefined =>
  contract.scopes === undefined || contract.scopes === 'all'
    ? undefined
    : `${contract.scopes.why}: ${contract.scopes.note}`

const namesAnotherPoint = (keyFrom: unknown, name: unknown): boolean =>
  keyFrom === null || (typeof keyFrom === 'string' && isPointName(keyFrom) && keyFrom !== name)

/** What a contract must hold, in the order the first failure is reported. */
const CONTRACT_RULES: readonly (readonly [
  (contract: Record<string, unknown>) => boolean,
  string,
])[] = [
  [
    contract => typeof contract['name'] === 'string' && isPointName(contract['name']),
    'the name is not a point name',
  ],
  [contract => isOneOf(TREES, contract['tree']), 'the tree is unknown'],
  [contract => isOneOf(ARITIES, contract['arity']), 'the arity is unknown'],
  [
    contract => namesAnotherPoint(contract['keyFrom'], contract['name']),
    'keyFrom names no other point',
  ],
  [contract => isText(contract['key']), 'key is not text'],
  [contract => isText(contract['gives']), 'gives is not text'],
  [contract => isText(contract['onError']), 'onError is not text'],
  [contract => isText(contract['summary']), 'summary is not text'],
  [contract => isOneOf(RESOLVES, contract['resolve']), 'the resolve rule is unknown'],
  [contract => isOneOf(BINDINGS, contract['binding']), 'the binding time is unknown'],
  [
    contract => Number.isInteger(contract['version']) && (contract['version'] as number) >= 1,
    'the version is not a positive integer',
  ],
  [
    contract => Number.isInteger(contract['revision']) && (contract['revision'] as number) >= 1,
    'the revision is not a positive integer',
  ],
  [contract => isOneOf(KEYS, contract['keys']), 'whether the keys are public is unknown'],
  [
    contract => contract['conformance'] === null || isText(contract['conformance']),
    'conformance is neither text nor null',
  ],
  [
    contract => contract['example'] === undefined || isText(contract['example']),
    'example is not text',
  ],
  [
    contract => isScopes(contract['scopes']),
    'scopes is neither all nor only the deployment with a known why and a note',
  ],
]

function contractProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'the contract is not an object'
  const failed = CONTRACT_RULES.find(([holds]) => !holds(value))
  return failed === undefined ? itemProblem(value['item']) : failed[1]
}

function declarationProblem(entry: Placed): string | null {
  if (entry.key === CATALOG) return 'the catalog declares itself; this key is reserved'
  if (entry.id !== '') return 'this point takes no id'
  const problem = contractProblem(entry.item)
  if (problem !== null) return problem
  return (entry.item as Contract).name === entry.key ? null : 'the contract names another point'
}

const HOLDS: Readonly<Record<FieldKind, (value: unknown) => boolean>> = {
  string: value => typeof value === 'string',
  number: value => typeof value === 'number',
  boolean: value => typeof value === 'boolean',
  function: value => typeof value === 'function',
  object: isRecord,
  array: Array.isArray,
}

function breach(contract: Contract, entry: Placed): string | null {
  const keyed = contract.arity === 'keyed-one' || contract.arity === 'keyed-list'
  const single = contract.arity === 'one' || contract.arity === 'keyed-one'
  if (!keyed && entry.key !== '') return 'this point takes no key'
  if (single && entry.id !== '') return 'this point takes no id'
  const item = entry.item
  if (!isRecord(item)) return 'the item is not an object'
  const fields = contract.item.fields
  const lacking = Object.keys(fields).find(field => !HOLDS[fields[field] as FieldKind](item[field]))
  return lacking === undefined ? null : `the item lacks ${lacking} (${fields[lacking]})`
}

const problemOf = (contract: Contract, entry: Placed): string | null =>
  contract.name === CATALOG ? declarationProblem(entry) : breach(contract, entry)

function reading(registry: Registry, point: string, asker: Scope): readonly Placed[] {
  return registry.placed.filter(
    placed =>
      placed.point === point &&
      visible(placed.scope, asker) &&
      standing(registry, placed.instance) === 'serving',
  )
}

/** The instance whose locked entry of this key and id, at a scope shallower than `scope`, would put an entry placed at `scope` out. */
export function lockOver(
  registry: Registry,
  point: string,
  key: string,
  id: string,
  scope: Scope,
): Instance | undefined {
  const locks = reading(registry, point, scope).filter(
    placed =>
      placed.key === key &&
      placed.id === id &&
      placed.lock === true &&
      placed.scope.length < scope.length,
  )
  return locks.sort((left, right) => left.scope.length - right.scope.length)[0]?.instance
}

const unreadSource = (registry: Registry, point: string, asker: Scope): string | undefined =>
  registry.unread.find(unread => unread.point === point && visible(unread.scope, asker))?.source

export function standingOf(registry: Registry, point: string, asker: Scope): PointStanding {
  if (point === CATALOG) return { kind: 'declared', contract: catalogContract, holders: [] }
  const source = unreadSource(registry, CATALOG, asker)
  if (source !== undefined) return { kind: 'unreadable', source }
  const valid = reading(registry, CATALOG, asker).filter(
    placed => placed.key === point && declarationProblem(placed) === null,
  )
  const [first] = valid
  if (first === undefined) return { kind: 'undeclared' }
  const holders = valid.map(placed => placed.instance).sort(byInstance)
  if (valid.some(placed => placed.digest !== first.digest))
    return { kind: 'ambiguous', by: holders }
  return { kind: 'declared', contract: first.item as Contract, holders }
}

function unavailableOf(
  standing: Exclude<PointStanding, { kind: 'declared' }>,
  point: string,
): Unavailable {
  if (standing.kind === 'undeclared')
    return { kind: 'unavailable', reason: 'undeclared', detail: point }
  if (standing.kind === 'unreadable')
    return { kind: 'unavailable', reason: 'unread', detail: standing.source }
  const fibers = [...new Set(standing.by.map(instance => instance.fiber))]
  return { kind: 'unavailable', reason: 'ambiguous', detail: fibers.join(', ') }
}

export function candidates<I = unknown>(
  registry: Registry,
  point: string,
  key: string | null,
  asker: Scope,
): Candidates<I> {
  const declared = standingOf(registry, point, asker)
  if (declared.kind !== 'declared') return unavailableOf(declared, point)
  const source = unreadSource(registry, point, asker)
  if (source !== undefined) return { kind: 'unavailable', reason: 'unread', detail: source }
  const read = reading(registry, point, asker) as readonly Placed<I>[]
  const open = opened(
    read.filter(placed => key === null || placed.key === key),
    closedBy(declared.contract),
  )
  const entries: Placed<I>[] = []
  const filtered: Filtered<I>[] = [...open.out]
  for (const placed of open.entries) {
    const detail = problemOf(declared.contract, placed)
    if (detail === null) entries.push(placed)
    else filtered.push({ entry: placed, reason: 'breach', detail })
  }
  const free = unlocked(entries)
  return {
    kind: 'read',
    contract: declared.contract,
    entries: free.entries,
    filtered: [...filtered, ...free.out],
  }
}

export function ask<I = unknown>(
  registry: Registry,
  point: string,
  key: string,
  asker: Scope,
): Answer<I> {
  const read = candidates<I>(registry, point, key, asker)
  if (read.kind !== 'read') return read
  const rule = read.contract.resolve === 'most-specific' ? mostSpecific : exactlyOne
  return rule(read.entries, read.filtered)
}

export function list<I = unknown>(
  registry: Registry,
  point: string,
  key: string | null,
  asker: Scope,
): Listing<I> {
  const read = candidates<I>(registry, point, key, asker)
  return read.kind === 'read' ? listed(read.entries, read.filtered) : read
}

const OUT_STATE = {
  closed: 'closed',
  locked: 'locked',
  breach: 'breach',
  overridden: 'breach',
} as const

const UNAVAILABLE_STATE = {
  undeclared: 'point-absent',
  ambiguous: 'point-ambiguous',
  unread: 'unread',
} as const

/** The fibers that put another content at the spot of this entry, among the entries its point weighs together. */
function rivalsOf(contract: Contract, entries: readonly Placed[], mine: Placed): string[] {
  const layered = contract.resolve === 'most-specific' || contract.arity.endsWith('list')
  const against = entries.filter(
    other =>
      other.id === mine.id &&
      other.digest !== mine.digest &&
      (!layered || other.scope.length === mine.scope.length),
  )
  return [...new Set(against.map(other => other.instance.fiber))]
}

function effectOf(registry: Registry, mine: Placed): Effect {
  const read = candidates(registry, mine.point, mine.key, mine.scope)
  if (read.kind !== 'read')
    return { entry: mine, state: UNAVAILABLE_STATE[read.reason], detail: read.detail }
  const out = read.filtered.find(filtered => filtered.entry === mine)
  if (out !== undefined) return { entry: mine, state: OUT_STATE[out.reason], detail: out.detail }
  const rivals = rivalsOf(read.contract, read.entries, mine)
  if (rivals.length > 0) return { entry: mine, state: 'conflict', detail: rivals.join(', ') }
  return { entry: mine, state: 'effective', detail: '' }
}

export function report(registry: Registry, instance: Instance): readonly Effect[] {
  const mine = placedBy(registry, instance)
  if (standing(registry, instance) === 'retiring')
    return mine.map(entry => ({ entry, state: 'retiring' as const, detail: '' }))
  return mine.map(entry => effectOf(registry, entry))
}
