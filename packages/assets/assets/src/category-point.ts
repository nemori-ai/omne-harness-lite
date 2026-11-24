import type { CategoryEffect } from './effect.ts'
import type { BodyContract } from './identity.ts'
import { copyTree } from './read-body.ts'

export type CategoryDisplay = Readonly<{
  title: string
  summary: string
  creation?: string
  /** For whoever writes one by hand: the layout, whole, with one to copy. Text of several lines. */
  authoring?: string
}>

/** How the general entry creates an asset of a category: not at all, from a body, or from a directory. */
export type CreationMode = 'none' | 'data' | 'directory'

export type CategoryContribution = Readonly<{
  contract: BodyContract
  display: CategoryDisplay
  generalCreation?: 'closed'
  point: string
  /** What a change of one of this category does, told by its owner; without it the assets tell from the holding. */
  effect?: CategoryEffect
}>

export type CategoryListing = Readonly<{
  category: string
  display: CategoryDisplay
  creation: CreationMode
  point: string
}>

export type CategoryUnusable = Readonly<{
  category: string
  unusable: 'conflict' | 'unread'
  detail: string
}>

export type CategoryView = Readonly<{
  lookup(category: string): BodyContract | undefined
  describe(category: string): CategoryListing | CategoryUnusable | undefined
  atPoint(point: string): CategoryListing | CategoryUnusable | undefined
  effectOf(category: string): CategoryEffect | undefined
  list(): readonly CategoryListing[]
}>

export type CategoryPoint = CategoryView &
  Readonly<{ contribute(contribution: CategoryContribution): () => void }>

export type CategoryReading =
  | Readonly<{ kind: 'read'; contributions: readonly CategoryContribution[] }>
  | Readonly<{ kind: 'unavailable'; detail: string }>

type Registered = Readonly<{
  contract: BodyContract
  listing: CategoryListing
  effect: CategoryEffect | undefined
}>
type Standings = ReadonlyMap<string, Registered | CategoryUnusable>
type Read = Readonly<{ standings: Standings; points: ReadonlyMap<string, string> }>

const byCategory = (left: CategoryListing, right: CategoryListing): number =>
  left.category < right.category ? -1 : 1

function creationOf(contract: BodyContract, general: 'closed' | undefined): CreationMode {
  if (general === 'closed') return 'none'
  return contract.layout === undefined ? 'data' : 'directory'
}

const listings = new WeakMap<CategoryContribution, Registered>()

function registered(contribution: CategoryContribution): Registered {
  const known = listings.get(contribution)
  if (known !== undefined) return known
  const { contract, display, generalCreation, point, effect } = contribution
  const creation = creationOf(contract, generalCreation)
  const listing = Object.freeze({ category: contract.category, display, creation, point })
  const made = Object.freeze({ contract, listing, effect })
  listings.set(contribution, made)
  return made
}

/** What two categories may not share: some source roots tell a category by its namespace alone, and a point holds one category. */
function sharedWith(
  mine: CategoryContribution,
  all: readonly CategoryContribution[],
): string | null {
  const others = all.filter(other => other.contract.category !== mine.contract.category)
  const namespace = mine.contract.layout?.namespace
  const sameSpace = others.find(
    other => namespace !== undefined && other.contract.layout?.namespace === namespace,
  )
  if (sameSpace !== undefined)
    return `the namespace ${namespace} is also the namespace of ${sameSpace.contract.category}`
  const samePoint = others.find(other => other.point === mine.point)
  return samePoint === undefined
    ? null
    : `the point ${mine.point} is also the point of ${samePoint.contract.category}`
}

const standingOf = (held: Registered | CategoryUnusable): CategoryListing | CategoryUnusable =>
  'contract' in held ? held.listing : held

function readOf(contributions: readonly CategoryContribution[]): Read {
  const points = new Map(contributions.map(({ contract, point }) => [point, contract.category]))
  return { standings: standingsOf(contributions), points }
}

function standingsOf(contributions: readonly CategoryContribution[]): Standings {
  const counted = new Map<string, number>()
  for (const { contract } of contributions)
    counted.set(contract.category, (counted.get(contract.category) ?? 0) + 1)
  const standings = new Map<string, Registered | CategoryUnusable>()
  for (const contribution of contributions) {
    const category = contribution.contract.category
    const count = counted.get(category) ?? 0
    const detail = count > 1 ? `${count} contributions` : sharedWith(contribution, contributions)
    standings.set(
      category,
      detail === null ? registered(contribution) : { category, unusable: 'conflict', detail },
    )
  }
  return standings
}

export function categoryViewOf(read: () => CategoryReading): CategoryView {
  const readNow = (): Read | string => {
    const reading = read()
    return reading.kind === 'read' ? readOf(reading.contributions) : reading.detail
  }
  const standings = (): Standings | string => {
    const now = readNow()
    return typeof now === 'string' ? now : now.standings
  }
  return Object.freeze({
    lookup(category: string): BodyContract | undefined {
      const now = standings()
      const held = typeof now === 'string' ? undefined : now.get(category)
      return held !== undefined && 'contract' in held ? held.contract : undefined
    },
    describe(category: string): CategoryListing | CategoryUnusable | undefined {
      const now = standings()
      if (typeof now === 'string') return { category, unusable: 'unread', detail: now }
      const held = now.get(category)
      return held === undefined ? undefined : standingOf(held)
    },
    atPoint(point: string): CategoryListing | CategoryUnusable | undefined {
      const now = readNow()
      if (typeof now === 'string') return { category: '', unusable: 'unread', detail: now }
      const held = now.standings.get(now.points.get(point) ?? '')
      return held === undefined ? undefined : standingOf(held)
    },
    effectOf(category: string): CategoryEffect | undefined {
      const now = standings()
      const held = typeof now === 'string' ? undefined : now.get(category)
      return held !== undefined && 'contract' in held ? held.effect : undefined
    },
    list(): readonly CategoryListing[] {
      const now = standings()
      if (typeof now === 'string') return Object.freeze([])
      const listed = [...now.values()].flatMap(held => ('contract' in held ? [held.listing] : []))
      return Object.freeze(listed.sort(byCategory))
    },
  })
}

/** Checks a contribution and freezes what a reader is given. It throws on a contribution that names nothing. */
export function admitCategory(contribution: CategoryContribution): CategoryContribution {
  const { contract, display, generalCreation, point, effect } = contribution
  if (contract.category === '') throw new TypeError('category name is empty')
  if (point === '') throw new TypeError('category point is empty')
  if ([display.title, display.summary, display.creation, display.authoring].includes(''))
    throw new TypeError('category display is incomplete')
  const schema = copyTree(contract.schema, false)
  if (schema === undefined) throw new TypeError('schema could not be copied')
  const { title, summary, creation, authoring } = display
  return Object.freeze({
    contract: Object.freeze({ ...contract, schema }),
    display: Object.freeze({
      title,
      summary,
      ...(creation === undefined ? {} : { creation }),
      ...(authoring === undefined ? {} : { authoring }),
    }),
    ...(generalCreation === undefined ? {} : { generalCreation }),
    point,
    ...(effect === undefined ? {} : { effect }),
  })
}

/** The categories held in memory: for a use of the assets without a registry, with the same readings. */
export function createCategoryPoint(): CategoryPoint {
  let contributions: readonly CategoryContribution[] = []
  return Object.freeze({
    contribute(contribution: CategoryContribution): () => void {
      const admitted = admitCategory(contribution)
      contributions = [...contributions, admitted]
      return () => {
        contributions = contributions.filter(held => held !== admitted)
      }
    },
    ...categoryViewOf(() => ({ kind: 'read', contributions })),
  })
}

export function unknownCategory(
  categories: Pick<CategoryView, 'lookup'>,
  category: string,
):
  | { readonly ok: true; readonly contract: BodyContract }
  | { readonly ok: false; readonly rejected: 'unknown-category' } {
  const contract = categories.lookup(category)
  if (contract === undefined) return { ok: false, rejected: 'unknown-category' }
  return { ok: true, contract }
}
