import type { JsonValue } from '@omne-harness/json-text'
import type { MaterializedMedium } from '@omne-harness/model-contract'
import type {
  HistoryEntry,
  HistoryPage,
  SessionAccess,
  SessionHistory,
} from '@omne-harness/session-contract'
import type { SessionDiagnosticGap } from '../view-types.ts'
import { member, textAt } from './json-tree.ts'

type Reference = MaterializedMedium['reference']
/** A block of the history by message and block: its content reference, or null when it has none. */
export type BlockReferences = ReadonlyMap<string, Reference | null>
export type BlockAnswer =
  | Readonly<{ kind: 'value'; value: BlockReferences }>
  | Readonly<{ kind: 'gap'; reason: SessionDiagnosticGap['reason'] }>

export const blockKey = (message: string, block: string): string => `${message}\u0000${block}`

function referenceOf(value: JsonValue | undefined): Reference | null | undefined {
  if (value === undefined) return null
  const [storage, key, mediaType, bytes, digest] = [
    textAt(value, 'storage'),
    textAt(value, 'key'),
    textAt(value, 'mediaType'),
    textAt(value, 'bytes'),
    textAt(value, 'digest'),
  ]
  if (storage === undefined || key === undefined || mediaType === undefined) return undefined
  if (bytes === undefined || digest === undefined) return undefined
  return { storage, key, mediaType, bytes, digest }
}

function collect(
  entry: HistoryEntry,
  wanted: ReadonlySet<string>,
  found: Map<string, Reference | null>,
) {
  const message = member(entry.payload, 'message')
  const id = textAt(message, 'id')
  const blocks = member(message, 'blocks')
  if (id === undefined || blocks?.kind !== 'array') return
  for (const block of blocks.items) {
    const at = textAt(block, 'id')
    const key = at === undefined ? undefined : blockKey(id, at)
    const reference = referenceOf(member(block, 'ref'))
    if (key !== undefined && wanted.has(key) && reference !== undefined) found.set(key, reference)
  }
}

export type BlockRead<P> = Readonly<{
  access: SessionAccess<P>
  history: Pick<SessionHistory<P>, 'begin' | 'next'>
  kinds: readonly string[]
  pageBytes: number
}>

// Reads the messages back from the newest until every wanted block is found or the history ends.
export async function blockReferencesOf<P>(
  input: BlockRead<P>,
  wanted: ReadonlySet<string>,
): Promise<BlockAnswer> {
  const kinds = input.kinds.filter(kind => kind.startsWith('message.'))
  if (kinds.length === 0) return { kind: 'gap', reason: 'not-disclosed' }
  const found = new Map<string, Reference | null>()
  const { access, history } = input
  let page: HistoryPage | undefined
  try {
    do {
      const read: Awaited<ReturnType<typeof history.begin>> =
        page === undefined
          ? await history.begin({
              ...access,
              kinds,
              from: null,
              direction: 'backward',
              pageBytes: input.pageBytes,
            })
          : await history.next({ ...access, cursor: page.next as string })
      if ('failure' in read)
        return { kind: 'gap', reason: read.failure.kind === 'denied' ? 'denied' : 'unavailable' }
      page = read.ok
      for (const entry of page.entries) collect(entry, wanted, found)
    } while (found.size < wanted.size && !page.exhausted && page.next !== null)
  } catch {
    return { kind: 'gap', reason: 'unavailable' }
  }
  return { kind: 'value', value: found }
}
