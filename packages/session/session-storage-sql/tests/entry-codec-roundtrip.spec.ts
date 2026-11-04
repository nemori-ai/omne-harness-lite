// Round trips of the `sl_entry` text codec at its edges (src/entry-codec.ts). Each case writes an
// entry and reads it back, and the payload tree read back is deeply equal to the tree written: the
// key order of every object, the lexeme of every number and every string unit included. The real
// rows are the rows the session-contract conformance suites commit through this member: each reads
// back to an entry that writes the same text again, and its evidence digest is the one the retired
// encoding gave for the same entry.
import { describe, expect, it } from 'vitest'
import { readJsonText, type JsonValue as JsonTree } from '@omne-harness/json-text'
import {
  adoptedInitializationFixture,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  ordinaryInput,
  sessionEntriesConformance,
  sessionTransactionsConformance,
  type SessionTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import type { HistoryEntry } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from '../src/codec.ts'
import { readEntryText, writeEntryText } from '../src/entry-codec.ts'
import { entryEvidence } from '../src/worker/history-index.ts'
import { app, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'

const ENVELOPE = {
  id: '7',
  revision: '3',
  kind: 'message.tool',
  schema: { owner: 'o', name: 'n', revision: '1', digest: 'sha256:00' },
  origin: {
    owner: 'o',
    via: null,
    source: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
  },
}

const LIMITS = {
  maxBytes: 1 << 24,
  maxDepth: 4096,
  maxItems: 1 << 20,
  maxMembers: 1 << 16,
  maxStringLength: 1 << 20,
  maxNumberLength: 1024,
}

/** The tree of a JSON text, as json-text reads it (lexemes and key order as written). */
function treeOfText(raw: string): JsonTree {
  const read = readJsonText(raw, LIMITS)
  if (read.kind !== 'ok') throw new Error(`the case does not read: ${read.kind}`)
  return read.value
}

/** Writes an entry with `payload`, reads it back and returns the payload tree read back. */
function roundTrip(payload: JsonTree): JsonTree {
  const entry = { ...ENVELOPE, payload } as unknown as HistoryEntry
  const back = readEntryText(writeEntryText(entry))
  expect(back).toEqual(entry)
  return back.payload as unknown as JsonTree
}

/** Deep equality that also compares the order of object keys (toEqual on arrays of entries does). */
const expectSame = (payload: JsonTree): void => {
  expect(roundTrip(payload)).toStrictEqual(payload)
}

const str = (value: string): JsonTree => ({ kind: 'string', value })
const num = (lexeme: string): JsonTree => ({ kind: 'number', lexeme })
const obj = (...entries: [string, JsonTree][]): JsonTree => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})
const arr = (...items: JsonTree[]): JsonTree => ({ kind: 'array', items })

describe('object keys', () => {
  it('keeps integer-like keys where they stand', () => {
    const payload = treeOfText('{"b":1,"10":2,"a":3,"2":4}')
    expectSame(payload)
    expect(roundTrip(payload)).toMatchObject({
      entries: [{ key: 'b' }, { key: '10' }, { key: 'a' }, { key: '2' }],
    })
  })

  it('keeps every order of a key set with array-index, large-number and plain keys', () => {
    const keys = ['0', '4294967294', '4294967295', '01', 'x', '__proto__']
    const orders = (rest: string[]): string[][] =>
      rest.length <= 1
        ? [rest]
        : rest.flatMap((key, at) =>
            orders([...rest.slice(0, at), ...rest.slice(at + 1)]).map(tail => [key, ...tail]),
          )
    for (const order of orders(keys))
      expectSame(obj(...order.map(key => [key, str(key)] as [string, JsonTree])))
  })

  it('keeps nested objects with integer-like keys inside arrays', () => {
    expectSame(treeOfText('[{"z":0,"1":{"9":[],"8":{}}},{"3":"c","b":"d"}]'))
  })
})

describe('number lexemes', () => {
  it('keeps each lexeme as written', () => {
    for (const lexeme of [
      '0',
      '-0',
      '1.0',
      '1e2',
      '1E2',
      '1e+2',
      '1e-7',
      '0.1',
      '0.30000000000000004',
      '12345678901234567890',
      '-9007199254740993',
      '1.7976931348623157e308',
      '1e400',
      '5e-324',
      '100',
    ])
      expectSame(obj(['n', num(lexeme)], ['in', arr(num(lexeme))]))
  })
})

describe('strings', () => {
  it('keeps escapes, control characters, non-BMP characters, lone surrogates and the empty string', () => {
    const controls = Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join('')
    for (const value of [
      '',
      '"\\/\b\f\n\r\t',
      controls,
      '\u007f\u0080  ',
      '😀 𝄞 中文',
      '\uD800',
      '\uDC00',
      'a\uD800b\uDFFFc',
      '😀',
    ]) {
      expectSame(obj([value, str(value)]))
      expectSame(arr(str(value)))
    }
  })
})

describe('containers', () => {
  it('keeps empty objects and arrays, and other leaves', () => {
    expectSame(obj())
    expectSame(arr())
    expectSame(obj(['a', obj()], ['b', arr()], ['c', arr(obj(), arr())]))
    expectSame(
      arr({ kind: 'null' }, { kind: 'boolean', value: true }, { kind: 'boolean', value: false }),
    )
  })

  it('keeps deep nesting (1000 levels of arrays and of objects)', () => {
    let deepArray: JsonTree = num('1')
    let deepObject: JsonTree = num('2')
    for (let level = 0; level < 1000; level += 1) {
      deepArray = arr(deepArray)
      deepObject = obj([String(level % 3), deepObject])
    }
    expectSame(deepArray)
    expectSame(deepObject)
  })
})

describe('the rows the conformance suites commit', () => {
  const apps: App[] = []
  async function fixture(): Promise<SessionTransactionsFixture<string>> {
    const a = await app()
    apps.push(a)
    return {
      port: a.port,
      access: a.access(TENANT_A),
      otherAccess: a.access(TENANT_B),
      creation: creation(),
      operation: name => operationId(name),
      initializationGuards: command =>
        Promise.resolve([
          initializationFixtureGuard(
            initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
          ),
        ]),
      askedAccessChecks: () => a.accessCheck.controls.asked().length,
    }
  }

  it('read back to entries that write the same text, with the digest of the retired encoding', async () => {
    for (const test of [
      ...sessionTransactionsConformance<string>(),
      ...sessionEntriesConformance<string>(),
    ])
      await test.run(await fixture())
    // A tool message the session admits as an ordinary input: the row is `message.tool`.
    const tool = await app()
    apps.push(tool)
    expect(await tool.create(TENANT_A)).toHaveProperty('ok')
    const visibility = { toHuman: true, toModel: true }
    const plain = ordinaryInput('tool-1')
    const accepted = await tool.accept(TENANT_A, 'session-1', 'tool-1', {
      ...plain,
      message: {
        id: plain.message.id,
        role: 'tool',
        blocks: [
          { kind: 'tool_result', id: 'result', visibility, callId: 'call-1' },
          { kind: 'text', id: 'out', visibility, text: 'line 1\n\t"quoted" \u{1F600} 1.50' },
        ],
      } as never,
    })
    expect(accepted, JSON.stringify(accepted)).toHaveProperty('ok')
    const kinds = new Set<string>()
    let rows = 0
    for (const a of apps)
      for (const domain of a.provider.domains())
        for (const row of a.provider.select(
          domain,
          'SELECT tenant, session, kind, entry, bytes FROM sl_entry',
        ).rows) {
          const [tenant, session, kind, text, size] = row.map(String) as string[]
          const entry = readEntryText(text as string)
          expect(writeEntryText(entry)).toBe(text)
          expect(Number(size)).toBe(Buffer.byteLength(text as string))
          const retired = decodeValue(
            JSON.parse(JSON.stringify(encodeValue(entry))) as JsonValue,
          ) as HistoryEntry
          expect(entryEvidence(tenant as string, session as string, entry)).toEqual(
            entryEvidence(tenant as string, session as string, retired),
          )
          kinds.add(kind as string)
          rows += 1
        }
    expect(rows).toBeGreaterThan(100)
    for (const kind of ['session.created', 'message.tool', 'call.execution-fact'])
      expect(kinds, [...kinds].join(',')).toContain(kind)
  }, 120_000)
})
