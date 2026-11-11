// The Session history rows a Ja of the production session-log Journal writes (Agent SPEC
// "真实历史的提交点"; AD-01): the main reply, whose caller is none and whose admission fact the Ja
// carries, enters the Session history as `message.assistant`; a tool result whose caller is the
// `message` hand-over enters it as `message.tool`. Either row and the Agent records are one storage
// commit: a failure of either write leaves neither, and the same operation then commits once. A
// rejected reply writes no row. On the node:sqlite double that runs the published modules.
import { describe, expect, it } from 'vitest'
import { ok } from './fixtures/common-journal.ts'
import type { SqlScene } from './fixtures/sql-scene.ts'
import {
  admitted,
  applied,
  load,
  opened,
  prepared,
  proof,
  type Commit,
  type Decision,
} from './fixtures/main-reply.ts'

const count = (s: SqlScene, table: string): number =>
  Number(s.controls?.select(`SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.[0] ?? -1)
/** The history rows a Ja writes: the message rows other than the user's initial input. */
const written = (s: SqlScene): string[] =>
  (s.controls?.select(`SELECT kind FROM sl_entry ORDER BY position`).rows ?? [])
    .map(row => String(row[0]))
    .filter(kind => kind.startsWith('message.') && kind !== 'message.user')

type Tagged =
  | { kind: 'null' }
  | { kind: 'boolean' | 'string'; value: unknown }
  | { kind: 'number'; lexeme: string }
  | { kind: 'array'; items: Tagged[] }
  | { kind: 'object'; entries: { key: string; value: Tagged }[] }
/** The plain value of the tagged JSON tree in which an entry stores its payload. */
function plainOf(tree: Tagged): unknown {
  switch (tree.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return tree.value
    case 'number':
      return Number(tree.lexeme)
    case 'array':
      return tree.items.map(plainOf)
    case 'object':
      return Object.fromEntries(tree.entries.map(item => [item.key, plainOf(item.value)]))
  }
}

/**
 * The payload of the history row a Ja wrote, read through the public history read of the Session
 * storage (not from the stored row text, whose encoding is the storage's own).
 */
const writtenEntry = async (s: SqlScene, kind: string): Promise<Record<string, unknown>> => {
  const page = ok(
    await s.port.history.begin({
      ...s.sessionAccess,
      kinds: [kind],
      from: null,
      direction: 'forward',
      pageBytes: 1 << 20,
    }),
  )
  expect(page.exhausted).toBe(true)
  expect(page.entries).toHaveLength(1)
  return plainOf(page.entries[0]?.payload as Tagged) as Record<string, unknown>
}

describe('a Ja writes the real history of its source into the Session log', () => {
  for (const [source, role] of [
    ['model-reply', 'message.assistant'],
    ['tool-result', 'message.tool'],
  ] as const) {
    it(`the ${source} enters the Session history as ${role} in the storage commit of the Agent records`, async () => {
      const { s, authority } = await opened(`history-${source}`)
      const request = await prepared(s, authority, source)
      const before = (await load(s)).revision
      s.commits.length = 0
      const receipt = ok(
        await s.view.journal.commit(await applied(s, authority, request, admitted(request))),
      )
      expect(s.commits).toEqual([['execution-record', 'session', 'session-ordinary-basis']])
      expect(written(s)).toEqual([role])
      expect(Number(receipt.revision)).toBe(Number(before) + 1)
    })

    it(`the ${source} row carries the message, the original handoff record and the prepared admission`, async () => {
      const { s, authority } = await opened(`history-${source}-pointers`)
      const request = await prepared(s, authority, source)
      ok(await s.view.journal.commit(await applied(s, authority, request, admitted(request))))
      const entry = await writtenEntry(s, role)
      expect(entry.message).toEqual(request.candidate)
      // The record of the handoff and the admission of the prepared result: not one for the other.
      expect(entry.source).toEqual(proof('record/h'))
      expect(entry.admission).toEqual(proof('admission/h'))
    })

    for (const [where, pattern] of [
      ['the Session write', /INSERT INTO sl_operation/],
      ['the Agent records write', /INSERT OR REPLACE INTO er_root/],
    ] as const)
      it(`the ${source}: a failure at ${where} leaves neither side, and the same operation then commits once`, async () => {
        const { s, authority } = await opened(`history-${source}-fault-${where.length}`)
        const request = await prepared(s, authority, source)
        const ja = await applied(s, authority, request, admitted(request))
        const before = {
          rows: count(s, 'sl_entry'),
          agent: (await load(s)).revision,
          published: count(s, 'er_operation'),
        }
        s.controls?.failWrite(pattern)
        expect(await s.view.journal.commit(ja)).toHaveProperty('failure')
        expect(count(s, 'sl_entry')).toBe(before.rows)
        expect(count(s, 'er_operation')).toBe(before.published)
        expect((await load(s)).revision).toBe(before.agent)
        expect(written(s)).toEqual([])
        const receipt = ok(await s.view.journal.commit(ja))
        expect(Number(receipt.revision)).toBe(Number(before.agent) + 1)
        expect(written(s)).toEqual([role])
      })
  }

  it('a message hand-over whose source is not the original handoff record is refused (Agent SPEC: message source)', async () => {
    const { s, authority } = await opened('history-foreign-source')
    const request = await prepared(s, authority, 'tool-result')
    const ja = await applied(s, authority, request, admitted(request))
    if (ja.caller.kind !== 'message') throw new Error('fixture: a tool result Ja carries message')
    const foreign = { ...ja, caller: { ...ja.caller, source: proof('record/another') } } as Commit
    const before = { rows: count(s, 'sl_entry'), agent: (await load(s)).revision }
    const refused = await s.view.journal.commit(foreign)
    expect(refused).toMatchObject({ failure: { kind: 'invalid', field: 'caller' } })
    expect(count(s, 'sl_entry')).toBe(before.rows)
    expect((await load(s)).revision).toBe(before.agent)
    ok(await s.view.journal.commit(ja))
    expect(written(s)).toEqual(['message.tool'])
  })

  it('a rejected main reply writes no history row and asks no Session participation', async () => {
    const { s, authority } = await opened('history-rejected')
    const request = await prepared(s, authority, 'model-reply')
    const rejected: Decision = {
      kind: 'rejected',
      reason: 'invalid',
      evidence: proof('rejected/h'),
    }
    s.commits.length = 0
    ok(await s.view.journal.commit(await applied(s, authority, request, rejected)))
    expect(s.commits).toEqual([['execution-record']])
    expect(written(s)).toEqual([])
  })

  it('a retry of the main reply Ja recognizes the original receipt and writes no second row', async () => {
    const { s, authority } = await opened('history-retry')
    const request = await prepared(s, authority, 'model-reply')
    const ja = await applied(s, authority, request, admitted(request))
    const first = ok(await s.view.journal.commit(ja))
    expect(ok(await s.view.journal.commit(ja))).toEqual(first)
    expect(ok(await s.fresh().journal.commit(ja))).toEqual(first)
    expect(written(s)).toEqual(['message.assistant'])
  })
})
