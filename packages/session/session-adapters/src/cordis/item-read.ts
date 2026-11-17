import {
  EXECUTION_RECORD_HANDLERS,
  decodeExecutionRecordItems,
  decodeExecutionRecordOpenItems,
  type ExecutionItem,
  type ExecutionItemKey,
} from '@omne-harness/session-storage-sql/participants'
import { READ_ATTEMPTS, type Reader } from './journal-read.ts'

export type ItemScope = Readonly<{ tenant: string; session: string; execution: string }>

// An execution the session does not hold reads as one without items.
export type ItemsRead =
  | Readonly<{ kind: 'read'; published: number; items: readonly ExecutionItem[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const unread = (diagnostic: string): ItemsRead => ({ kind: 'unavailable', diagnostic })

// The open items of one execution, of the named families or of all: every page at one head, read
// again when the head moved between pages.
export async function readOpenItems(
  read: Reader,
  scope: ItemScope,
  families: readonly string[] | null,
): Promise<ItemsRead> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    let after: ExecutionItemKey | null = null
    let published: string | null = null
    const items: ExecutionItem[] = []
    for (;;) {
      const output = await read(EXECUTION_RECORD_HANDLERS.openItems, {
        ...scope,
        after,
        ...(families === null ? {} : { families: [...families] }),
      })
      if (output.kind === 'unread')
        return unread(`the open items of the execution are not readable: ${output.reason}`)
      const page = decodeExecutionRecordOpenItems(output.output)
      if (page === null) return unread('the open items of the execution do not decode')
      if (page.kind === 'denied') return { kind: 'read', published: 0, items: [] }
      if (page.kind === 'missing') return unread('the Agent records of the session are older')
      if (published !== null && page.published !== published) break
      published = page.published
      items.push(...page.items)
      if (page.next === null) return { kind: 'read', published: Number(published), items }
      after = page.next
    }
  }
  return unread('the open items of the execution kept changing while they were read')
}

// Items of one execution by original key, open or closed; keys the store never held are left out.
export async function readItems(
  read: Reader,
  scope: ItemScope,
  keys: readonly ExecutionItemKey[],
): Promise<ItemsRead> {
  const output = await read(EXECUTION_RECORD_HANDLERS.items, { ...scope, keys: [...keys] })
  if (output.kind === 'unread')
    return unread(`the items of the execution are not readable: ${output.reason}`)
  const found = decodeExecutionRecordItems(output.output)
  if (found === null) return unread('the items of the execution do not decode')
  if (found.kind === 'denied') return { kind: 'read', published: 0, items: [] }
  if (found.kind === 'missing') return unread('the Agent records of the session are older')
  return { kind: 'read', published: Number(found.published), items: found.items }
}
