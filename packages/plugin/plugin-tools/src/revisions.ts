import {
  CATALOG,
  impact,
  type Change,
  type Contract,
  type Registry,
  type Scope,
} from '@omne-harness/dynamis'

type State = Change['before']

/** One line of what changed between two registries: a point declared or gone, an entry placed or gone, a receipt that moved. */
export type TreeChange = Readonly<{
  kind: 'point' | 'placed' | 'state'
  sign: '+' | '-' | '~'
  /** The declared point for a point line; the point the entry is on otherwise. */
  point: string
  key: string
  id: string
  side: Contract['tree'] | null
  scope: Scope
  /** The instance that placed it, as <fiber>#<generation>. */
  by: string
  before: State
  after: State
  detail: string
}>

/** The revisions of the registry in this process: a revision is "<process>.<count>"; the latest few are kept. */
export type Revisions = Readonly<{
  current(): string
  /** What changed between two registries; unknown when the revision is not of this process or older than the oldest kept. */
  since(revision: string): readonly TreeChange[] | 'unknown'
}>

const DEFAULT_LIMIT = 64

function lineOf(change: Change): TreeChange {
  const { entry, before, after, detail } = change
  const sign = before === 'absent' ? '+' : after === 'absent' ? '-' : '~'
  const declares = entry.point === CATALOG && sign !== '~'
  return {
    kind: declares ? 'point' : sign === '~' ? 'state' : 'placed',
    sign,
    point: declares ? entry.key : entry.point,
    key: declares ? '' : entry.key,
    id: entry.id,
    side: declares ? (entry.item as Contract).tree : null,
    scope: entry.scope,
    by: `${entry.instance.fiber}#${entry.instance.generation}`,
    before,
    after,
    detail,
  }
}

const byKind = { point: 0, placed: 1, state: 2 } as const

export function createRevisions(
  input: Readonly<{ process: string; limit?: number }>,
): Revisions & Readonly<{ record(registry: Registry): void }> {
  const limit = input.limit ?? DEFAULT_LIMIT
  const kept: { count: number; registry: Registry }[] = []
  let count = 0
  const latest = () => kept[kept.length - 1]
  return {
    current: () => `${input.process}.${count}`,
    record(registry) {
      count += 1
      kept.push({ count, registry })
      if (kept.length > limit) kept.shift()
    },
    since(revision) {
      const at = revision.lastIndexOf('.')
      const number = Number(revision.slice(at + 1))
      if (
        at < 0 ||
        revision.slice(0, at) !== input.process ||
        !/^\d+$/.test(revision.slice(at + 1))
      )
        return 'unknown'
      if (number === count) return []
      const then = kept.find(held => held.count === number)
      const now = latest()
      if (then === undefined || now === undefined) return 'unknown'
      return impact(then.registry, now.registry)
        .map(lineOf)
        .sort((left, right) => byKind[left.kind] - byKind[right.kind])
    },
  }
}
