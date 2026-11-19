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
}>

const PAGE_LIMIT = 100

export function createCategoryNames(client: ClientOf<AssetsProtocol>): CategoryNames {
  return Object.freeze({
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
