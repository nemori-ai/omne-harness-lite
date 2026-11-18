import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'

export type CategoryNames = Readonly<{
  read(): Promise<ReadonlyMap<string, string> | undefined>
}>

const PAGE_LIMIT = 100

export function createCategoryNames(client: ClientOf<AssetsProtocol>): CategoryNames {
  return Object.freeze({
    async read() {
      const names = new Map<string, string>()
      let after: string | null = null
      try {
        do {
          const answer = await client['list-categories']({ after, limit: PAGE_LIMIT })
          if (answer.outcome !== 'succeeded') return undefined
          for (const item of answer.body.items) names.set(item.category, item.title)
          after = answer.body.next
        } while (after !== null)
      } catch {
        return undefined
      }
      return names
    },
  })
}
