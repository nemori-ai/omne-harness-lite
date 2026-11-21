import type { PortRead } from '@omne-harness/dispatch'
import type { HistoryEntry, HistoryPage, RunId } from '@omne-harness/session-contract'
import type { Called } from './ports.ts'

export const REPLY_KINDS = ['message.assistant', 'run.started', 'run.terminal'] as const
export const SILENT_REPLY = 'The run ended without a final reply.'
/** How many pages are read back for the end of one run before the reply counts as not readable now. */
const PAGES = 8
const PAGE_BYTES = 262_144

type Json = HistoryEntry['payload']

function member(tree: Json | undefined, key: string): Json | undefined {
  return tree?.kind === 'object' ? tree.entries.find(entry => entry.key === key)?.value : undefined
}
const textOf = (tree: Json | undefined): string | undefined =>
  tree?.kind === 'string' ? tree.value : undefined

function said(entry: HistoryEntry): string {
  const blocks = member(member(entry.payload, 'message'), 'blocks')
  const texts = blocks?.kind === 'array' ? blocks.items : []
  return texts
    .filter(block => textOf(member(block, 'kind')) === 'text')
    .map(block => textOf(member(block, 'text')) ?? '')
    .join('\n')
}

const endsRun = (entry: HistoryEntry, run: RunId): boolean =>
  entry.kind === 'run.terminal' && textOf(member(member(entry.payload, 'terminal'), 'run')) === run

type Read = (cursor: string | null, pageBytes: number) => Promise<Called<HistoryPage>>

/** The text of the last assistant message of a run, read back from the end of the history.
 * Runs of one session do not overlap: after the end of the run is seen, the next assistant message is its last. */
export async function lastReplyOf(read: Read, run: RunId): Promise<PortRead<string>> {
  let cursor: string | null = null
  let within = false
  for (let page = 0; page < PAGES; page += 1) {
    const answer: Called<HistoryPage> = await read(cursor, PAGE_BYTES).catch(
      () => 'unknown' as const,
    )
    if (answer === 'unknown' || 'failure' in answer) return { kind: 'unavailable' }
    for (const entry of answer.ok.entries) {
      if (!within) within = endsRun(entry, run)
      else if (entry.kind === 'message.assistant')
        return { kind: 'read', value: said(entry) || SILENT_REPLY }
      else if (entry.kind === 'run.started') return { kind: 'read', value: SILENT_REPLY }
    }
    cursor = answer.ok.next
    if (cursor === null) break
  }
  return { kind: 'unavailable' }
}
