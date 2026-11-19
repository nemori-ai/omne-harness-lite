import type { Message } from '@omne-harness/message'
import { decodeEntry, type SessionEntry } from './entries.ts'
import type { HistoryEntry } from './faces.ts'
import type { DurableEvidence, EntryId, InputId, RunId } from './identity.ts'
import { foldInputFate, type InputFate } from './input-fate.ts'
import type { AdmittedSource } from './input-sources.ts'
import type { RoutedInput, WorkSnapshot } from './values.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

export type PendingInput = Readonly<{
  input: InputId
  /** The position of its acceptance in the log; a page continues after it. */
  position: EntryId
  source: Pick<AdmittedSource, 'name' | 'label'>
  role: AdmittedSource['role']
  wakes: boolean
  preview: string
}>

export type PendingPage = Readonly<{ inputs: readonly PendingInput[]; next: EntryId | null }>

/** One call that stands still until a person answers the card it raised. */
export type WaitingCall = Readonly<{
  card: DurableEvidence
  /** The action the card is about; null for a card a passage raised for itself. */
  action: string | null
  passage: string
  position: string
  run: RunId | null
}>

export const PENDING_PREVIEW_CHARS = 160
export const PENDING_PAGE_LIMIT = 100

export function waitingCalls(snapshot: WorkSnapshot): readonly WaitingCall[] {
  const run = snapshot.run.kind === 'active' ? snapshot.run.run : null
  const out: WaitingCall[] = []
  for (const wait of snapshot.waiting) {
    if (wait.kind !== 'extension-batch' && wait.kind !== 'extension-passage') continue
    const { passage, position } = wait
    const members: readonly Readonly<{
      card: DurableEvidence
      decision: unknown
      action?: string
    }>[] = wait.members
    for (const { card, decision, action } of members)
      if (decision === null) out.push({ card, action: action ?? null, passage, position, run })
  }
  return out
}

export function previewOf(message: Message): string {
  const text = message.blocks
    .map(block => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .filter(part => part !== '')
    .join(' ')
  const points = [...text]
  return points.length <= PENDING_PREVIEW_CHARS
    ? text
    : `${points.slice(0, PENDING_PREVIEW_CHARS).join('')}…`
}

function decoded(rows: Iterable<HistoryEntry>): SessionEntry[] | null {
  const out: SessionEntry[] = []
  for (const row of rows) {
    const entry = decodeEntry(row)
    if (!('ok' in entry)) return null
    out.push(entry.ok)
  }
  return out
}

/** The acceptance of each pending input, by input. Null: a row of the log does not read. */
export function pendingAcceptances(
  rows: Iterable<HistoryEntry>,
): ReadonlyMap<InputId, Readonly<{ position: EntryId; source: AdmittedSource }>> | null {
  const found = new Map<InputId, Readonly<{ position: EntryId; source: AdmittedSource }>>()
  for (const row of rows) {
    if (row.kind !== 'intake.routed') continue
    const entry = decodeEntry(row)
    if (!('ok' in entry)) return null
    const routed = entry.ok
    if (routed.kind === 'intake.routed' && 'input' in routed)
      found.set(routed.input, { position: row.id, source: routed.source })
  }
  return found
}

export function pendingInputOf(
  stored: Ordinary,
  accepted: Readonly<{ position: EntryId; source: AdmittedSource }>,
): PendingInput {
  const { name, label, role, wakes } = accepted.source
  return {
    input: stored.input,
    position: accepted.position,
    source: { name, label },
    role,
    wakes,
    preview: previewOf(stored.message),
  }
}

/** One page of the pending inputs in the order they were accepted, after a position. */
export function pendingPageOf(
  inputs: readonly PendingInput[],
  after: EntryId | null,
  limit: number,
): PendingPage {
  const ordered = [...inputs].sort((left, right) =>
    BigInt(left.position) < BigInt(right.position) ? -1 : 1,
  )
  const rest =
    after === null ? ordered : ordered.filter(item => BigInt(item.position) > BigInt(after))
  const page = rest.slice(0, limit)
  const last = page.at(-1)
  return { inputs: page, next: rest.length > page.length && last ? last.position : null }
}

/** The fate of an input from stored rows of the fate kinds. `unreadable`: a row does not read. */
export function inputFateOfRows(
  input: InputId,
  rows: Iterable<HistoryEntry>,
): Readonly<{ fate: InputFate | null }> | 'unreadable' {
  const entries = decoded(rows)
  return entries === null ? 'unreadable' : { fate: foldInputFate(input, entries) }
}
