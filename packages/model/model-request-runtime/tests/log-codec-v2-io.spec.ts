import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import * as codec from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import {
  openJsonlSessionLog,
  type JsonlSessionLog,
  type LogEntry,
  type OwnedLogEntry,
  type ReadResult,
} from '@omne-harness-lite/session-log-jsonl'
import { anchors, batch, jsonObject, response, session, tenant } from './log-codec-fixture.ts'
import { batchV2, responseV5 } from './log-codec-v2-fixture.ts'

const evidenceRoot = fileURLToPath(
  new URL('../../../../tmp/model-request-runtime/m1-codec-v2/jsonl/', import.meta.url),
)
const ownership = {
  current: `codec-v2-controlled:${process.pid}`,
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
  work: (
    log: JsonlSessionLog,
    dir: string,
    submit: (entries: readonly OwnedLogEntry[]) => ReturnType<JsonlSessionLog['append']>,
  ) => Promise<void>,
) {
  await mkdir(evidenceRoot, { recursive: true })
  const dir = await mkdtemp(join(evidenceRoot, `${name}-`))
  const log = await openJsonlSessionLog({ dir: join(dir, 'log'), processOwnership: ownership })
  const calls: { ordinal: number; count: number; formats: unknown[] }[] = []
  async function submit(entries: readonly OwnedLogEntry[]) {
    calls.push({
      ordinal: calls.length + 1,
      count: entries.length,
      formats: entries.map(entry => jsonObject(entry.payload).format),
    })
    return await log.append(session, entries, fence, condition)
  }
  try {
    expect(readable(await log.readSince(session, 0))).toEqual({ entries: [], tail: 0 })
    await work(log, dir, submit)
  } finally {
    await log.close()
    expect(await log.readSince(session, 0)).toEqual({ failure: 'unavailable' })
    await writeFile(
      join(dir, 'append-calls.json'),
      JSON.stringify(
        {
          scope:
            'Controlled originally empty log. All append paths are this submit closure, no production provenance claim.',
          writers: ['legacy whole-batch writer', 'v2 whole-batch writer'],
          calls,
        },
        null,
        2,
      ),
    )
  }
}
function initialEntries(): readonly OwnedLogEntry[] {
  return anchors().entries.map(({ session: _session, position: _position, ...entry }) => entry)
}
function originalFormats(entries: readonly LogEntry[]) {
  return entries.map(entry => jsonObject(entry.payload).format)
}
describe('LC5-V4/V5 controlled actual public JSONL: no production provenance certification', () => {
  for (const first of ['legacy', 'v2']) {
    it(`same identities: ${first} first wins entire batch, no second response or cost`, async () => {
      await controlled(first, async (log, dir, submit) => {
        expect(await submit(initialEntries())).toHaveProperty('positions')
        const legacy = batch(response),
          current = batchV2(responseV5)
        const submissions = first === 'legacy' ? [legacy, current] : [current, legacy]
        const results = await Promise.all(submissions.map(submit))
        expect(results[0]).toHaveProperty('positions')
        expect(results[1]).toMatchObject({ failure: 'alreadyRecorded' })
        const prefix = readable(await log.readSince(session, 0))
        expect(prefix.tail).toBe(4)
        expect(originalFormats(prefix.entries)).toEqual([
          'mrr/1',
          'mrr/1',
          first === 'legacy' ? 'mrr/1' : 'mrr/2',
          first === 'legacy' ? 'mrr/1' : 'mrr/2',
        ])
        const result = inspect(prefix)
        if (!('completeMembers' in result)) throw new Error('winner')
        expect(result.completeMembers.entries).toHaveLength(2)
        expect(
          codec.modelLogJsonEqual(
            result.completeMembers.response.value,
            first === 'legacy' ? response : responseV5,
          ),
        ).toBe(true)
        await writeFile(join(dir, 'readback.json'), writeJsonLossless(prefix))
      })
    })
  }
  it('one actual [M,R] append retains arrays, cost and opened timing after close/reopen', async () => {
    await controlled('reopen', async (log, dir, submit) => {
      expect(await submit(initialEntries())).toHaveProperty('positions')
      const entries = batchV2()
      expect(await submit(entries)).toHaveProperty('positions')
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
        const openedValue = jsonObject(jsonObject(opened.payload).value)
        expect(jsonObject(full.timing).firstTokenAt).toBe(openedValue.firstTokenAt)
        await writeFile(join(dir, 'reopened-readback.json'), writeJsonLossless(prefix))
      } finally {
        await reopened.close()
      }
    })
  })
})
