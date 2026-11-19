import type { HistoryEntry } from '@omne-harness/session-contract'
import { foldText } from './fold.ts'

/** Bump when what an entry contributes changes: an index of another version is stale. */
export const EXTRACTION_VERSION = 1

export const SEARCHABLE_KINDS = [
  'message.user',
  'message.assistant',
  'message.tool',
  'message.system_reminder',
  'message.tool_internal',
  'message.compaction',
] as const
export type SearchableKind = (typeof SEARCHABLE_KINDS)[number]

export const DEFAULT_SEARCH_KINDS: readonly SearchableKind[] = SEARCHABLE_KINDS.slice(0, 4)

const KIND_CODES: Readonly<Record<SearchableKind, string>> = {
  'message.user': 'u',
  'message.assistant': 'a',
  'message.tool': 't',
  'message.system_reminder': 's',
  'message.tool_internal': 'i',
  'message.compaction': 'c',
}

// Reserved code points separate and mark inside an index row and never stand in its text.
// A marker is one trigram, so a filter is one more term of the index query.
export const BLOCK_SEPARATOR = '\u0001'
const MARKER_START = '\u0002'
const MARKER_END = '\u0003'
const RESERVED = ['\u0001', '\u0002', '\u0003', '\u0004'] as const

export const kindMarker = (kind: SearchableKind): string => `${MARKER_START}k${KIND_CODES[kind]}`
export const visibilityMarker = (visibility: DocumentVisibility): string =>
  `${MARKER_START}m${visibility === 'model' ? '1' : '0'}`

export function isSearchableKind(kind: string): kind is SearchableKind {
  return Object.hasOwn(KIND_CODES, kind)
}

export type DocumentVisibility = 'model' | 'other'
export type IndexDocument = Readonly<{
  visibility: DocumentVisibility
  text: string
  markers: readonly string[]
}>

type Block = Readonly<{ text: string; toModel: boolean }>
type Searchable = Readonly<{ kind: SearchableKind; blocks: readonly Block[] }>

type Tree = HistoryEntry['payload']

function member(tree: Tree | undefined, key: string): Tree | undefined {
  if (tree?.kind !== 'object') return undefined
  return tree.entries.find(entry => entry.key === key)?.value
}

function blockOf(tree: Tree): Block | null {
  const stated = member(tree, 'text') ?? member(tree, 'transcript')
  if (stated?.kind !== 'string' || stated.value === '') return null
  const toModel = member(member(tree, 'visibility'), 'toModel')
  return { text: stated.value, toModel: toModel?.kind === 'boolean' && toModel.value }
}

// The one rule of what can be searched, read off the JSON tree an entry carries its payload in.
function searchableOf(entry: HistoryEntry): Searchable | null {
  if (!isSearchableKind(entry.kind)) return null
  const blocks = member(member(entry.payload, 'message'), 'blocks')
  if (blocks?.kind !== 'array') return null
  const found = blocks.items.map(blockOf).filter(block => block !== null)
  return found.length === 0 ? null : { kind: entry.kind, blocks: found }
}

export function searchableKindOf(entry: HistoryEntry): SearchableKind | null {
  return searchableOf(entry)?.kind ?? null
}

export function blocksOf(entry: HistoryEntry, visibility: 'only' | 'any'): readonly string[] {
  const blocks = searchableOf(entry)?.blocks ?? []
  return blocks.filter(block => visibility === 'any' || block.toModel).map(block => block.text)
}

export function indexedText(block: string): string {
  let text = foldText(block)
  for (const reserved of RESERVED) text = text.replaceAll(reserved, BLOCK_SEPARATOR)
  return text
}

/** What an entry contributes to the index: at most one document per visibility. */
export function documentsOf(entry: HistoryEntry): readonly IndexDocument[] {
  const searchable = searchableOf(entry)
  if (searchable === null) return []
  const documents: IndexDocument[] = []
  for (const visibility of ['model', 'other'] as const) {
    const texts = searchable.blocks
      .filter(block => block.toModel === (visibility === 'model'))
      .map(block => indexedText(block.text))
    if (texts.length === 0) continue
    documents.push({
      visibility,
      text: texts.join(BLOCK_SEPARATOR),
      markers: [kindMarker(searchable.kind), visibilityMarker(visibility)],
    })
  }
  return documents
}

/** The text of one index row: the document, then its markers, each closed. */
export function documentRow(document: IndexDocument, more: readonly string[] = []): string {
  const markers = [...document.markers, ...more].map(marker => marker + MARKER_END).join('')
  return document.text + BLOCK_SEPARATOR + markers
}

export function isTextGram(gram: string): boolean {
  return !RESERVED.some(reserved => gram.includes(reserved))
}
