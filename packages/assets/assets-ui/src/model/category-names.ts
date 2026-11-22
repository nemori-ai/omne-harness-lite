import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { notice } from './assets-machine.ts'
import type { Notice } from './settings-machine.ts'

/** Every category the server knows, by identifier, with its name; or why they could not be read. */
export type CategoriesRead =
  | Readonly<{ kind: 'read'; names: ReadonlyMap<string, string> }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type CategoryNames = Readonly<{
  read(): Promise<CategoriesRead>
  /** Calls the listener when the server's categories changed; absent when nothing can tell. */
  changed?: (listener: () => void) => () => void
}>

/** What the connection tells of the server's tree: the keys now on a point that makes them public. */
export type KeysSource = Readonly<{
  keys(point: string): readonly string[] | undefined
  subscribe(listener: () => void): () => void
}>

/** The point on the server's tree whose keys are the category names. */
export const CATEGORIES_POINT = 'assets.categories'

const PAGE_LIMIT = 100

function following(source: KeysSource): NonNullable<CategoryNames['changed']> {
  const told = (): string => JSON.stringify(source.keys(CATEGORIES_POINT) ?? null)
  return listener => {
    let last = told()
    return source.subscribe(() => {
      const now = told()
      if (now === last) return
      last = now
      listener()
    })
  }
}

export function createCategoryNames(
  client: ClientOf<AssetsProtocol>,
  source?: KeysSource,
): CategoryNames {
  return Object.freeze({
    ...(source !== undefined && { changed: following(source) }),
    async read(): Promise<CategoriesRead> {
      const names = new Map<string, string>()
      let after: string | null = null
      try {
        do {
          const answer = await client['list-categories']({ after, limit: PAGE_LIMIT })
          if (answer.outcome !== 'succeeded')
            return { kind: 'failed', notice: notice(answer.outcome) }
          for (const item of answer.body.items) names.set(item.category, item.title)
          after = answer.body.next
        } while (after !== null)
      } catch {
        return { kind: 'failed', notice: notice('unavailable') }
      }
      return { kind: 'read', names }
    },
  })
}
