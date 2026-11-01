// The one non-durable double of the holder-reference reader (RD-TOOLHEAD). It stands in for the
// application bridge `tool-residency` until that bridge exists. The double makes the query key
// with `encodeResidentKey` and projects each record with `projectResidentReferences`, the same
// tool-contract functions the real bridge calls, so the double and the bridge fail the same way.
// It declares `durability: 'none'` and must not be assembled into production.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  encodeResidentKey,
  projectResidentReferences,
  residentToolFacts,
  type ResidentReferencesPage,
} from '@omne-harness/tool-contract'
import type { ToolBindingKey, ToolShape } from '@omne-harness/tool-contract/provider'
import type { ToolResidencyPage, ToolResidencyReader } from './cordis.ts'

/** The structural form of Session `references`. It does not import session-contract. */
export type ResidentReferencesRead = (
  input: Readonly<{ scope: 'system'; key: string; after: string | null; limit: number }>,
) => Promise<Outcome<ResidentReferencesPage, Readonly<{ kind: string }>>>

export type MemoryToolResidencyReader = Readonly<{
  durability: 'none'
  reader: ToolResidencyReader
  /**
   * Built-in source only: replaces the holders of a key. The key and each shape are stored in the
   * text form that Session stores. Throws when the double reads an outer source, or when the key
   * or a shape cannot be encoded.
   */
  set(
    key: ToolBindingKey,
    holders: readonly Readonly<{ tenant: TenantId; session: string; shape: ToolShape }>[],
  ): void
  /** Every later read answers unavailable until `restore`, an already obtained cursor too. */
  interrupt(diagnostic?: string): void
  restore(): void
}>

type Unavailable = Readonly<{ kind: 'unavailable'; diagnostic: string }>
const unavailable = (diagnostic: string): Outcome<never, Unavailable> =>
  fail({ kind: 'unavailable', diagnostic })

/**
 * Builds the reader double. With `source`, it reads that source (for example the `references` of
 * the session-contract in-memory transactions) and passes `after` and `limit` through. Without
 * `source`, it reads a built-in store that `set` fills, in pages of at most `pageSize` holders,
 * with opaque cursors bound to the key. `pageSize` defaults to 2 and must be a positive safe
 * integer.
 */
export function createMemoryToolResidencyReader(
  input: Readonly<{ source?: ResidentReferencesRead; pageSize?: number }> = {},
): MemoryToolResidencyReader {
  const pageSize = input.pageSize ?? 2
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError(`pageSize must be a positive safe integer, got ${String(pageSize)}`)
  const outer = input.source
  const store = new Map<string, ResidentReferencesPage['sessions']>()
  const cursors = new Map<string, Readonly<{ key: string; offset: number }>>()
  let interrupted: string | null = null

  const builtIn: ResidentReferencesRead = async ({ key, after, limit }) => {
    let offset = 0
    if (after !== null) {
      const cursor = cursors.get(after)
      if (cursor === undefined || cursor.key !== key) return fail({ kind: 'cursor' })
      offset = cursor.offset
    }
    const sessions = store.get(key) ?? []
    const end = offset + limit
    let next: string | null = null
    if (end < sessions.length) {
      next = `cursor-${cursors.size + 1}`
      cursors.set(next, { key, offset: end })
    }
    return succeed({ sessions: sessions.slice(offset, end), next })
  }
  const source = outer ?? builtIn

  const reader: ToolResidencyReader = {
    async referencing({ scope, key, after }) {
      if (interrupted !== null) return unavailable(interrupted)
      if (scope !== 'system') return unavailable('scope')
      const text = encodeResidentKey(key)
      if ('failure' in text) return unavailable(`key: ${text.failure.field} ${text.failure.reason}`)
      let read: Awaited<ReturnType<ResidentReferencesRead>>
      try {
        read = await source({ scope: 'system', key: text.ok, after, limit: pageSize })
      } catch (error) {
        return unavailable(`source: ${String(error)}`)
      }
      // An interruption during the read wins: the page must not count as an answer.
      if (interrupted !== null) return unavailable(interrupted)
      if ('failure' in read) return unavailable(`source: ${read.failure.kind}`)
      const page = projectResidentReferences(read.ok)
      if ('failure' in page)
        return unavailable(`shape: ${page.failure.field} ${page.failure.reason}`)
      const result: ToolResidencyPage = page.ok
      return succeed(result)
    },
  }

  return Object.freeze({
    durability: 'none',
    reader,
    set(key, holders) {
      if (outer !== undefined) throw new Error('set is only available on the built-in source')
      const sessions = holders.map(holder => {
        const facts = residentToolFacts(key, holder.shape)
        if ('failure' in facts)
          throw new TypeError(`cannot store: ${facts.failure.field} ${facts.failure.reason}`)
        return {
          tenant: holder.tenant,
          session: holder.session,
          capability: facts.ok.capability,
          shape: facts.ok.shape,
        }
      })
      const text = encodeResidentKey(key)
      if ('failure' in text) throw new TypeError(`cannot store: ${text.failure.field}`)
      store.set(text.ok, Object.freeze(sessions))
    },
    interrupt(diagnostic = 'interrupted') {
      interrupted = diagnostic
    },
    restore() {
      interrupted = null
    },
  } satisfies MemoryToolResidencyReader)
}
