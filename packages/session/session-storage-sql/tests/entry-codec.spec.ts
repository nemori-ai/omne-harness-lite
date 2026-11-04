// The `sl_entry` text codec (src/entry-codec.ts): the stored text holds the payload as plain JSON,
// the entry read back is the entry written (number lexemes and key order included), the digest of
// the entry object does not change, a repeated key and a row of the retired encoding are refused,
// and the stored bytes stay within 1.15 times the plain JSON of the entry.
import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import type { HistoryEntry } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { canonicalText, decodeValue, encodeValue, plainOf, sha256 } from '../src/codec.ts'
import {
  readEntryText,
  readEntryTexts,
  StoredEntryMalformed,
  writeEntryText,
} from '../src/entry-codec.ts'
import { entryEvidence } from '../src/worker/history-index.ts'
import { scenarioEntries, tree } from './fixtures/session-scenario.ts'

const entries = scenarioEntries(30) as unknown as HistoryEntry[]

/** The entry as the retired encoding stored and read it: the reference for the digest. */
const retiredText = (entry: HistoryEntry): string => JSON.stringify(encodeValue(entry))
const retiredRead = (text: string): HistoryEntry =>
  decodeValue(JSON.parse(text) as JsonValue) as HistoryEntry

/** The entry with its payload as the plain JSON value: the size the user sees as "plain JSON". */
const plainText = (entry: HistoryEntry): string =>
  JSON.stringify({ ...entry, payload: plainOf(entry.payload) })

const bytes = (text: string): number => Buffer.byteLength(text)

/** One entry whose payload has the given raw JSON text, read by json-text. */
function entryWithPayload(raw: string): HistoryEntry {
  const read = readJsonText(raw, {
    maxBytes: 1 << 20,
    maxDepth: 64,
    maxItems: 1 << 16,
    maxMembers: 1 << 16,
    maxStringLength: 1 << 20,
    maxNumberLength: 400,
  })
  if (read.kind !== 'ok') throw new Error(`fixture does not read: ${read.kind}`)
  return { ...(entries[1] as HistoryEntry), payload: read.value as never }
}

describe('the stored text', () => {
  it('holds the payload as plain JSON, without the value-tree wrapping', () => {
    for (const entry of entries) {
      const text = writeEntryText(entry)
      const stored = JSON.parse(text) as Record<string, unknown>
      expect(stored['body']).toEqual(plainOf(entry.payload))
      expect(stored).not.toHaveProperty('payload')
      expect(text).not.toContain('"kind":"string"')
    }
  })

  it('reads back the entry it was written from, and its digest does not change', () => {
    for (const entry of entries) {
      const read = readEntryText(writeEntryText(entry))
      expect(read).toEqual(entry)
      // The digest of the entry object (the evidence of the row) is the one the retired encoding gave.
      expect(entryEvidence('t', 's', read)).toEqual(
        entryEvidence('t', 's', retiredRead(retiredText(entry))),
      )
      expect(sha256(canonicalText(read))).toBe(sha256(canonicalText(entry)))
    }
  })

  it('keeps number lexemes and key order, array-index keys included', () => {
    const raw =
      '{"b":1.0,"1":[1e3,-0,0.1,12345678901234567890123,1E-7],"a":{"10":true,"2":null,"z":"x"},"0":"first?"}'
    const entry = entryWithPayload(raw)
    const text = writeEntryText(entry)
    expect(text).toContain(`"body":${raw}`)
    expect(readEntryText(text)).toEqual(entry)
  })

  it('reads a text the fast path does not take (spaces) to the same entry', () => {
    const entry = entries[5] as HistoryEntry
    const spaced = JSON.stringify(JSON.parse(writeEntryText(entry)), null, 2)
    expect(readEntryText(spaced)).toEqual(entry)
  })

  it('writes the members in the order of the entry, the payload in its place', () => {
    const text = writeEntryText(entries[0] as HistoryEntry)
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      'id',
      'revision',
      'kind',
      'schema',
      'body',
      'origin',
    ])
  })
})

describe('refusals', () => {
  it('a payload tree with a repeated key is not written', () => {
    const entry = {
      ...(entries[1] as HistoryEntry),
      payload: {
        kind: 'object',
        entries: [
          { key: 'a', value: { kind: 'null' } },
          { key: 'a', value: { kind: 'null' } },
        ],
      } as never,
    }
    expect(() => writeEntryText(entry)).toThrow(/repeats/u)
  })

  it('a stored text with a repeated key is malformed, never read with one of the values', () => {
    const text = writeEntryText(entries[1] as HistoryEntry).replace(
      '"body":{',
      '"body":{"run":"x","run":"y",',
    )
    expect(() => readEntryText(text)).toThrow(StoredEntryMalformed)
    expect(() => readEntryText(text)).toThrow(/duplicate-key/u)
  })

  it('a row of the retired value-tree encoding is malformed with its own diagnostic', () => {
    for (const entry of entries.slice(0, 20)) {
      const text = retiredText(entry)
      expect(() => readEntryText(text, 'sl_entry 7')).toThrow(StoredEntryMalformed)
      expect(() => readEntryText(text, 'sl_entry 7')).toThrow(
        /sl_entry 7: the row is in the retired value-tree encoding/u,
      )
    }
  })

  it('a text that is not JSON, not an object, without a body or with both members is malformed', () => {
    const body = writeEntryText(entries[1] as HistoryEntry)
    for (const text of [
      '',
      '{"id":',
      '[1]',
      '{"id":"1","kind":"x"}',
      body.replace('"body":', '"payload":{"kind":"null"},"body":'),
    ])
      expect(() => readEntryText(text)).toThrow(StoredEntryMalformed)
  })

  it('a history page whose entries are not texts is malformed', () => {
    expect(() => readEntryTexts([{ id: '1' }])).toThrow(StoredEntryMalformed)
    expect(() => readEntryTexts(null)).toThrow(StoredEntryMalformed)
  })
})

describe('size on the fixed session', () => {
  it('stores at most 1.15 times the plain JSON of the entries', () => {
    const kinds = new Set(entries.map(entry => entry.kind))
    for (const kind of ['message.tool', 'call.bound', 'call.execution-fact', 'session.created'])
      expect(kinds).toContain(kind)
    const stored = entries.reduce((sum, entry) => sum + bytes(writeEntryText(entry)), 0)
    const plain = entries.reduce((sum, entry) => sum + bytes(plainText(entry)), 0)
    const retired = entries.reduce((sum, entry) => sum + bytes(retiredText(entry)), 0)
    console.log(
      JSON.stringify({
        measure: 'sl_entry bytes',
        entries: entries.length,
        retired,
        stored,
        plain,
        storedOverPlain: Number((stored / plain).toFixed(4)),
        retiredOverPlain: Number((retired / plain).toFixed(4)),
      }),
    )
    expect(stored / plain).toBeLessThanOrEqual(1.15)
  })

  it('the tool-heavy shape of the measured session: few prose bytes, many small values', () => {
    // The measured session had 2.48x; most of its bytes were small structured values.
    const structured = scenarioEntries(4).map(entry => ({
      ...entry,
      payload: tree({
        calls: Array.from({ length: 40 }, (_, i) => ({ id: `c-${i}`, ok: i % 2 === 0, n: i })),
      }),
    })) as unknown as HistoryEntry[]
    const stored = structured.reduce((sum, entry) => sum + bytes(writeEntryText(entry)), 0)
    const plain = structured.reduce((sum, entry) => sum + bytes(plainText(entry)), 0)
    const retired = structured.reduce((sum, entry) => sum + bytes(retiredText(entry)), 0)
    console.log(
      JSON.stringify({
        measure: 'sl_entry bytes, structured payloads',
        retired,
        stored,
        plain,
        retiredOverPlain: Number((retired / plain).toFixed(4)),
      }),
    )
    expect(stored / plain).toBeLessThanOrEqual(1.15)
  })
})
