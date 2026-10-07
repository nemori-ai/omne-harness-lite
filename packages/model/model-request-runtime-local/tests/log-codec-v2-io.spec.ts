import { DatabaseSync } from 'node:sqlite'
import { modelFormat, modelValue } from './log-codec-fixture.ts'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import * as codec from '@omne-harness-lite/model-request-runtime'
import { openSqlLogFixture, type SqlLogFixture } from './sql-log-fixture.ts'
import { type LogEntry, type OwnedLogEntry, type ReadResult } from '@omne-harness-lite/session-log'
import { anchors, batch, jsonObject, response, session, tenant } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'

const evidenceRoot = fileURLToPath(
  new URL('../../../../tmp/model-request-runtime/current-codec/jsonl/', import.meta.url),
)
const ownership = {
  current: `current-codec-controlled:${process.pid}`,
  async observeExit() {
    return 'unknown' as const
  },
}
const fence = { kind: 'unfenced' } as const
const condition = { kind: 'unconditional' } as const
function readable(result: ReadResult) {
  if ('failure' in result) throw new Error(`read: ${result.failure}`)
  return result
}
function inspect(prefix: ReturnType<typeof readable>) {
  const dispatched = prefix.entries[0],
    opened = prefix.entries[1]
  if (dispatched === undefined || opened === undefined) throw new Error('anchors')
  return codec.inspectSettlementMembers({
    mode: 'read',
    session,
    tenant,
    prefix,
    anchors: { dispatched, opened, intent: null },
    target: { call: 'call', dispatch: 1, response: 'response' },
    current: null,
  })
}
async function controlled(name: string, work: (log: SqlLogFixture, dir: string) => Promise<void>) {
  await mkdir(evidenceRoot, { recursive: true })
  const dir = await mkdtemp(join(evidenceRoot, `${name}-`))
  const log = await openSqlLogFixture({ dir: join(dir, 'log') })
  try {
    await work(log, dir)
  } finally {
    await log.close()
  }
}
function initialEntries(): readonly OwnedLogEntry[] {
  return anchors().entries.map(({ session: _session, position: _position, ...entry }) => entry)
}
function priorGeneration(entry: OwnedLogEntry): OwnedLogEntry {
  if (jsonObject(entry.payload).kind === 'message') return entry
  const old = (value: string) => value.replace(/^mrr\/3\//u, 'mrr/1/')
  return {
    ...entry,
    ...(entry.dedupeKey === undefined ? {} : { dedupeKey: old(entry.dedupeKey) }),
    readKeys: entry.readKeys.map(old),
    payload: { ...jsonObject(entry.payload), version: 'mrr/1' },
  }
}

describe('D100 actual SQL current codec and old-data isolation', () => {
  it('one complete current batch wins; another whole batch cannot add response or cost', async () => {
    await controlled('first-wins', async log => {
      expect(await log.append(session, initialEntries(), fence, condition)).toHaveProperty(
        'positions',
      )
      const first = batch(responseV5)
      const second = batch(response)
      expect(await log.append(session, first, fence, condition)).toHaveProperty('positions')
      expect(await log.append(session, second, fence, condition)).toMatchObject({
        failure: 'alreadyRecorded',
      })
      const prefix = readable(await log.readSince(session, 0))
      expect(prefix.tail).toBe(4)
      expect(prefix.entries.map(entry => modelFormat(entry.payload))).toEqual([
        'mrr/3',
        'mrr/3',
        'mrr/3',
        'mrr/3',
      ])
      const result = inspect(prefix)
      if (!('completeMembers' in result)) throw new Error('winner')
      expect(result.completeMembers.entries).toHaveLength(2)
      expect(codec.modelLogJsonEqual(result.completeMembers.response.value, responseV5)).toBe(true)
    })
  })

  it('reopens full [message,response], preserving headers, exact cost and opened timing', async () => {
    await controlled('reopen', async (log, dir) => {
      expect(await log.append(session, initialEntries(), fence, condition)).toHaveProperty(
        'positions',
      )
      expect(await log.append(session, batch(responseV5), fence, condition)).toHaveProperty(
        'positions',
      )
      const before = readable(await log.readSince(session, 0))
      await log.close()
      const reopened = await openSqlLogFixture({ dir: join(dir, 'log') })
      try {
        const prefix = readable(await reopened.readSince(session, 0))
        expect(codec.modelLogJsonEqual(prefix, before)).toBe(true)
        const result = inspect(prefix)
        if (!('completeMembers' in result)) throw new Error('reopen')
        const full = jsonObject(result.completeMembers.response.value)
        expect(jsonObject(full.raw).headers).toEqual(jsonObject(responseV5.raw).headers)
        expect(writeJsonLossless(full.cost ?? null)).toContain('0.0000000000000000000000000310')
        const opened = prefix.entries[1]
        if (opened === undefined) throw new Error('opened')
        expect(jsonObject(full.timing).firstTokenAt).toBe(
          jsonObject(modelValue(opened.payload)).firstTokenAt,
        )
        await writeFile(join(dir, 'readback.json'), writeJsonLossless(prefix))
      } finally {
        await reopened.close()
      }
    })
  })

  it('leaves old SQL row bytes untouched and reports old model rows as unavailable', async () => {
    await controlled('old-unchanged', async (log, dir) => {
      const entries = [...initialEntries(), ...batch(response)].map(priorGeneration)
      expect(await log.append(session, entries, fence, condition)).toHaveProperty('positions')
      const db = new DatabaseSync(join(dir, 'log', 'journal.sqlite'))
      const raw = () =>
        db.prepare('select value from sl_entry order by position_length, position').all()
      const before = raw()
      expect(before).toHaveLength(4)
      const prefix = readable(await log.readSince(session, 0))
      expect(inspect(prefix)).toEqual({ undetermined: true, reason: 'unknown_format' })
      expect(raw()).toEqual(before)
      expect(
        prefix.entries
          .filter(entry => jsonObject(entry.payload).kind === 'fact')
          .every((entry: LogEntry) => modelFormat(entry.payload) === 'mrr/1'),
      ).toBe(true)
      expect(
        prefix.entries
          .filter(entry => jsonObject(entry.payload).kind === 'message')
          .map(entry => jsonObject(entry.payload).version),
      ).toEqual(['8'])
      db.close()
    })
  })
})
