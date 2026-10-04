import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import * as codec from '@omne-harness-lite/model-request-runtime'
import { openJsonlSessionLog, type JsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
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
async function controlled(
  name: string,
  work: (log: JsonlSessionLog, dir: string) => Promise<void>,
) {
  await mkdir(evidenceRoot, { recursive: true })
  const dir = await mkdtemp(join(evidenceRoot, `${name}-`))
  const log = await openJsonlSessionLog({ dir: join(dir, 'log'), processOwnership: ownership })
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
  const old = (value: string) => value.replace(/^mrr\/3\//u, 'mrr/1/')
  return {
    ...entry,
    ...(entry.dedupeKey === undefined ? {} : { dedupeKey: old(entry.dedupeKey) }),
    readKeys: entry.readKeys.map(old),
    payload: { ...jsonObject(entry.payload), format: 'mrr/1' },
  }
}

describe('D100 actual JSONL current codec and old-data isolation', () => {
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
      expect(prefix.entries.map(entry => jsonObject(entry.payload).format)).toEqual([
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
      const reopened = await openJsonlSessionLog({
        dir: join(dir, 'log'),
        processOwnership: ownership,
      })
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
          jsonObject(jsonObject(opened.payload).value).firstTokenAt,
        )
        await writeFile(join(dir, 'readback.json'), writeJsonLossless(prefix))
      } finally {
        await reopened.close()
      }
    })
  })

  it('leaves old JSONL bytes untouched and reports old model rows as unavailable', async () => {
    await controlled('old-unchanged', async (log, dir) => {
      const entries = [...initialEntries(), ...batch(response)].map(priorGeneration)
      expect(await log.append(session, entries, fence, condition)).toHaveProperty('positions')
      const files = (await readdir(join(dir, 'log'))).filter(name => name.endsWith('.jsonl'))
      const before = await Promise.all(files.map(name => readFile(join(dir, 'log', name))))
      const prefix = readable(await log.readSince(session, 0))
      expect(inspect(prefix)).toEqual({ undetermined: true, reason: 'unknown_format' })
      const after = await Promise.all(files.map(name => readFile(join(dir, 'log', name))))
      expect(after).toEqual(before)
      expect(
        prefix.entries.every((entry: LogEntry) => jsonObject(entry.payload).format === 'mrr/1'),
      ).toBe(true)
    })
  })
})
