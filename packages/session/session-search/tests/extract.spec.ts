import { describe, expect, it } from 'vitest'
import {
  BLOCK_SEPARATOR,
  SEARCHABLE_KINDS,
  blocksOf,
  documentRow,
  documentsOf,
  foldText,
  kindMarker,
  searchableKindOf,
  visibilityMarker,
} from '../src/index.ts'
import { ALPHABET, entryOf, random, randomText } from './support.ts'

const indexed = (block: string): string =>
  ['\u0002', '\u0003', '\u0004'].reduce(
    (text, reserved) => text.replaceAll(reserved, '\u0001'),
    foldText(block),
  )

describe('the searchable text of a log entry', () => {
  it('gives the index and the verification the same blocks, for any entry (SH-1)', () => {
    const seed = 20261119
    const rng = random(seed)
    for (let round = 0; round < 400; round += 1) {
      const kind = rng.pick([...SEARCHABLE_KINDS, 'message.delivered', 'run.started'])
      const blocks = Array.from({ length: rng.below(5) }, () => ({
        text: randomText(rng, 12),
        toModel: rng.next() < 0.6,
        kind: rng.pick(['text', 'thinking', 'text']),
      }))
      const entry = entryOf(kind, blocks)
      const documents = documentsOf(entry)
      const where = `seed ${String(seed)} round ${String(round)}`
      const model = documents.find(document => document.visibility === 'model')
      const other = documents.find(document => document.visibility === 'other')
      const only = blocksOf(entry, 'only')
      const any = blocksOf(entry, 'any')
      expect(model?.text ?? null, where).toBe(
        only.length === 0 ? null : only.map(indexed).join(BLOCK_SEPARATOR),
      )
      const rest = any.filter(
        block => !only.includes(block) || countOf(any, block) > countOf(only, block),
      )
      expect(other === undefined, where).toBe(any.length === only.length)
      expect(documents.length, where).toBeLessThanOrEqual(2)
      if (other !== undefined) expect(rest.length, where).toBeGreaterThan(0)
      const indexedBlocks = documents.flatMap(document => document.text.split(BLOCK_SEPARATOR))
      for (const block of any)
        for (const part of indexed(block).split(BLOCK_SEPARATOR))
          expect(indexedBlocks, where).toContain(part)
    }
  })

  it('makes no document of an entry that is not a searchable message', () => {
    const blocks = [{ text: 'hello' }]
    expect(documentsOf(entryOf('message.delivered', blocks))).toEqual([])
    expect(blocksOf(entryOf('message.delivered', blocks), 'any')).toEqual([])
    expect(searchableKindOf(entryOf('message.delivered', blocks))).toBeNull()
    expect(documentsOf(entryOf('run.started', blocks))).toEqual([])
    expect(documentsOf(entryOf('message.user', []))).toEqual([])
    expect(searchableKindOf(entryOf('message.user', blocks))).toBe('message.user')
  })

  it('reads nothing out of a payload that is not a message with blocks', () => {
    const entry = entryOf('message.user', [{ text: 'hello' }])
    for (const payload of [null, 'text', [], {}, { message: null }, { message: { blocks: 'x' } }])
      expect(documentsOf({ ...entry, payload } as never)).toEqual([])
    const odd = {
      message: { blocks: [null, 7, { text: 9 }, { text: '' }, { transcript: 'said' }] },
    }
    expect(blocksOf({ ...entry, payload: odd } as never, 'any')).toEqual(['said'])
    expect(blocksOf({ ...entry, payload: odd } as never, 'only')).toEqual([])
  })

  it('splits an entry by what the model can read: at most one document of each', () => {
    const entry = entryOf('message.assistant', [
      { text: 'Seen One' },
      { text: 'hidden', toModel: false },
      { text: 'Seen Two' },
    ])
    expect(documentsOf(entry)).toEqual([
      {
        visibility: 'model',
        text: `seen one${BLOCK_SEPARATOR}seen two`,
        markers: [kindMarker('message.assistant'), visibilityMarker('model')],
      },
      {
        visibility: 'other',
        text: 'hidden',
        markers: [kindMarker('message.assistant'), visibilityMarker('other')],
      },
    ])
    expect(blocksOf(entry, 'only')).toEqual(['Seen One', 'Seen Two'])
    expect(blocksOf(entry, 'any')).toEqual(['Seen One', 'hidden', 'Seen Two'])
  })

  it('keeps the text of a document free of what marks a row, and gives each kind its own marker', () => {
    const [document] = documentsOf(entryOf('message.tool', [{ text: 'a\u0002kub\u0003c\u0004d' }]))
    expect(document!.text).toBe('a\u0001kub\u0001c\u0001d')
    const markers = SEARCHABLE_KINDS.map(kindMarker)
    expect(new Set(markers).size).toBe(SEARCHABLE_KINDS.length)
    for (const marker of [...markers, visibilityMarker('model'), visibilityMarker('other')]) {
      expect(Array.from(marker)).toHaveLength(3)
      expect(document!.text).not.toContain(marker)
    }
    expect(documentRow(document!, ['\u0004ab'])).toBe(
      `${document!.text}\u0001${markers[2]!}\u0003${visibilityMarker('model')}\u0003\u0004ab\u0003`,
    )
  })

  it('has symbols in its test alphabet that the rules above have to cope with', () => {
    expect(ALPHABET).toContain('\u0002')
    expect(ALPHABET).toContain('😀')
  })
})

function countOf(items: readonly string[], item: string): number {
  return items.filter(other => other === item).length
}
