import type { BodyContract } from './identity.ts'
import { copyTree } from './read-body.ts'

export type CategoryDisplay = Readonly<{ title: string; summary: string; creation?: string }>

/** How the general entry creates an asset of a category: not at all, from a body, or from a directory. */
export type CreationMode = 'none' | 'data' | 'directory'

export type CategoryContribution = Readonly<{
  contract: BodyContract
  display: CategoryDisplay
  generalCreation?: 'closed'
}>

export type CategoryListing = Readonly<{
  category: string
  display: CategoryDisplay
  creation: CreationMode
}>

export type CategoryView = Readonly<{
  lookup(category: string): BodyContract | undefined
  describe(category: string): CategoryListing | undefined
  list(): readonly CategoryListing[]
}>

export type CategoryPoint = CategoryView &
  Readonly<{ contribute(contribution: CategoryContribution): () => void }>

type Entry = Readonly<{ contract: BodyContract; listing: CategoryListing }>

export function createCategoryPoint(): CategoryPoint {
  const entries = new Map<string, Entry>()
  let listed: readonly CategoryListing[] = Object.freeze([])

  function relist(): void {
    listed = Object.freeze(
      [...entries.values()]
        .map(entry => entry.listing)
        .sort((left, right) => (left.category < right.category ? -1 : 1)),
    )
  }

  return Object.freeze({
    contribute(contribution: CategoryContribution): () => void {
      const entry = admit(contribution)
      const category = entry.listing.category
      if (entries.has(category)) throw new TypeError('category already registered')
      entries.set(category, entry)
      relist()
      return () => {
        if (entries.get(category) !== entry) return
        entries.delete(category)
        relist()
      }
    },
    lookup(category: string): BodyContract | undefined {
      return entries.get(category)?.contract
    },
    describe(category: string): CategoryListing | undefined {
      return entries.get(category)?.listing
    },
    list(): readonly CategoryListing[] {
      return listed
    },
  })
}

function creationOf(contract: BodyContract, general: 'closed' | undefined): CreationMode {
  if (general === 'closed') return 'none'
  return contract.layout === undefined ? 'data' : 'directory'
}

function admit({ contract, display, generalCreation }: CategoryContribution): Entry {
  const category = contract.category
  if (category === '') throw new TypeError('category name is empty')
  if (display.title === '' || display.summary === '' || display.creation === '')
    throw new TypeError('category display is incomplete')
  const schema = copyTree(contract.schema, false)
  if (schema === undefined) throw new TypeError('schema could not be copied')
  const { title, summary, creation } = display
  return Object.freeze({
    contract: Object.freeze({ ...contract, category, schema }),
    listing: Object.freeze({
      category,
      display: Object.freeze(
        creation === undefined ? { title, summary } : { title, summary, creation },
      ),
      creation: creationOf(contract, generalCreation),
    }),
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
