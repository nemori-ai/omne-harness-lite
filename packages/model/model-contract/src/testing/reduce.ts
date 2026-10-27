// The block table of a call that is fed upstream facts. It turns facts into the visible blocks of
// a snapshot, and refuses a transition that the contract forbids: filling a block that was not
// opened, filling it in the other mode, changing a sealed block, or sealing it with a block that
// does not match what it holds.
import { isDeepStrictEqual } from 'node:util'
import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { GrowingContentKind, ModelBlock, VisibleBlock } from '../index.ts'
import type { TransportFact } from '../provider/index.ts'

export type FillEntry =
  | {
      readonly state: 'open'
      readonly mode: 'append' | 'replace'
      readonly content: GrowingContentKind
      value: string
      /** A trim reported that arguments were cut off, so they can never become a tool suggestion. */
      truncated: boolean
    }
  | { readonly state: 'sealed'; readonly block: ModelBlock }

export type FillTable = Map<string, FillEntry>

/** True when the sealing block holds exactly what the open block gathered. */
function matches(entry: Extract<FillEntry, { state: 'open' }>, block: ModelBlock): boolean {
  switch (entry.content) {
    case 'text':
      return block.kind === 'text' && block.text === entry.value
    case 'thinking':
      return block.kind === 'thinking' && block.text === entry.value
    case 'voice':
      return block.kind === 'voice'
    case 'tool-arguments':
      return block.kind === 'tool_call' && !entry.truncated && argumentsEqual(entry.value, block)
  }
}

const ARGUMENT_LIMITS: JsonLimits = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 10_000,
  maxStringLength: 1_000_000,
  maxNumberLength: 64,
}

function argumentsEqual(text: string, block: Extract<ModelBlock, { kind: 'tool_call' }>): boolean {
  if (!text.isWellFormed()) return false
  const read = readJsonText(text, ARGUMENT_LIMITS)
  return read.kind === 'ok' && isDeepStrictEqual(read.value, block.arguments)
}

/** Seals a block that was never opened: whole media blocks and reasoning state parts arrive that way. */
function sealsWhole(block: ModelBlock): boolean {
  return block.kind === 'image' || block.kind === 'file' || block.kind === 'reasoning_state'
}

type OpenEntry = Extract<FillEntry, { state: 'open' }>

/** The entry at the index when it still takes fill; a sealed or unopened block gives none. */
function openAt(table: FillTable, index: string): OpenEntry | null {
  const entry = table.get(index)
  return entry?.state === 'open' ? entry : null
}

function sealAt(table: FillTable, index: string, block: ModelBlock): boolean {
  const entry = table.get(index)
  const allowed =
    entry === undefined ? sealsWhole(block) : entry.state === 'open' && matches(entry, block)
  if (allowed) table.set(index, { state: 'sealed', block: structuredClone(block) })
  return allowed
}

/** Fills an open block in the mode that the fact belongs to; a block in the other mode refuses it. */
function fillAt(
  table: FillTable,
  fact: Extract<TransportFact, { kind: 'block-delta' | 'block-replace' }>,
): boolean {
  const entry = openAt(table, fact.index)
  const wanted = fact.kind === 'block-delta' ? 'append' : 'replace'
  if (entry?.mode !== wanted) return false
  entry.value = fact.kind === 'block-delta' ? entry.value + fact.delta : fact.value
  return true
}

/** Applies one fact. False means the fact is a forbidden transition and was not applied. */
export function applyFact(table: FillTable, fact: TransportFact): boolean {
  switch (fact.kind) {
    case 'block-open': {
      if (table.has(fact.index)) return false
      const { mode, content } = fact
      table.set(fact.index, { state: 'open', mode, content, value: '', truncated: false })
      return true
    }
    case 'block-delta':
    case 'block-replace':
      return fillAt(table, fact)
    case 'block-seal':
      return sealAt(table, fact.index, fact.block)
    case 'trim': {
      const entry = openAt(table, fact.index)
      if (entry === null) return false
      entry.truncated = true
      return true
    }
    case 'account':
    case 'diagnostic':
    case 'ended':
      return true
  }
}

export function visibleBlocks(table: FillTable): VisibleBlock[] {
  return [...table].map(([index, entry]): VisibleBlock =>
    entry.state === 'sealed'
      ? { kind: 'sealed', index, block: structuredClone(entry.block) }
      : { kind: 'growing', index, mode: entry.mode, content: entry.content, value: entry.value },
  )
}
