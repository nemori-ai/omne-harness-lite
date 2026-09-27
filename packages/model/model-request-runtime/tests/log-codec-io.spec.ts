import { mkdtemp, readdir, readlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  modelLogJsonEqual,
  inspectSettlementMembers,
} from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  openJsonlSessionLog,
  type JsonlSessionLog,
  type LogEntry,
  type ReadResult,
} from '@omne-harness-lite/session-log-jsonl'
import { anchors, batch, response, session, tenant, reply } from './log-codec-fixture.ts'

const fence = { kind: 'unfenced' } as const
const condition = { kind: 'unconditional' } as const
const ownership = {
  current: `codec-controlled-test:${process.pid}`,
  async observeExit() {
    return 'unknown' as const
  },
}
function readable(result: ReadResult): {
  readonly entries: readonly LogEntry[]
  readonly tail: import('@omne-harness-lite/content-blocks').JsonNumber
} {
  if ('failure' in result) throw new Error(`controlled provider read: ${result.failure}`)
  return result
}
async function withLog<T>(work: (log: JsonlSessionLog, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'omne-codec-controlled-'))
  try {
    const log = await openJsonlSessionLog({ dir, processOwnership: ownership })
    try {
      return await work(log, dir)
    } finally {
      await log.close()
      expect(await log.readSince(session, 0)).toEqual({ failure: 'unavailable' })
      const descriptors = await readdir('/proc/self/fd')
      const targets = await Promise.all(
        descriptors.map(async fd => {
          try {
            return await readlink(`/proc/self/fd/${fd}`)
          } catch (error) {
            if (
              error !== null &&
              typeof error === 'object' &&
              'code' in error &&
              error.code === 'ENOENT'
            )
              return ''
            throw error
          }
        }),
      )
      expect(targets.filter(path => path.startsWith(dir))).toEqual([])
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
function inspected(prefix: ReturnType<typeof readable>) {
  const dispatched = prefix.entries[0],
    opened = prefix.entries[1]
  if (dispatched === undefined || opened === undefined) throw new Error('controlled anchors')
  return inspectSettlementMembers({
    mode: 'read',
    session,
    tenant,
    prefix,
    anchors: { dispatched, opened, intent: null },
    target: { call: 'call', dispatch: 1, response: 'response' },
    current: { messageId: 'losing-message', disposition: { consumed: { by: 'side_query' } } },
  })
}
describe('D088 controlled real public JSONL provider; no production provenance claim', () => {
  for (const first of ['external', 'runtime'])
    it(`C-V3 ${first} whole batch wins and loser THIS has no writes`, async () => {
      await withLog(async log => {
        const initial = anchors()
        expect(
          await log.append(
            session,
            initial.entries.map(({ session: _session, position: _position, ...entry }) => entry),
            fence,
            condition,
          ),
        ).toHaveProperty('positions')
        const external = batch()
        const runtime = batch({
          ...response,
          reply: { ...reply, id: 'losing-message', blocks: [] },
          replyDisposition: { consumed: { by: 'side_query' } },
        })
        const submissions = first === 'external' ? [external, runtime] : [runtime, external]
        const results = await Promise.all(
          submissions.map(entries => log.append(session, entries, fence, condition)),
        )
        expect(results[0]).toHaveProperty('positions')
        expect(results[1]).toHaveProperty('failure', 'alreadyRecorded')
        const prefix = readable(await log.readSince(session, 0))
        expect(prefix.entries).toHaveLength(first === 'external' ? 4 : 3)
        const responses = prefix.entries.filter(
          entry =>
            typeof entry.payload === 'object' &&
            entry.payload !== null &&
            'category' in entry.payload &&
            entry.payload.category === 'response',
        )
        const messages = prefix.entries.filter(
          entry =>
            typeof entry.payload === 'object' &&
            entry.payload !== null &&
            'category' in entry.payload &&
            entry.payload.category === 'message',
        )
        expect(responses).toHaveLength(1)
        expect(messages).toHaveLength(first === 'external' ? 1 : 0)
        const result = inspected(prefix)
        if (!('completeMembers' in result)) throw new Error('expected controlled legal members')
        expect(result.completeMembers.response.response?.id).toBe('response')
        expect(result.completeMembers.message?.message?.id ?? null).toBe(
          first === 'external' ? 'winner-message' : null,
        )
        expect(result.completeMembers.disposition).toBe(
          first === 'external' ? 'firstWinner' : 'same',
        )
        expect(writeJsonLossless(result.completeMembers.response.value)).toContain(
          '0.0000000000000000000000000310',
        )
      })
    })
  it('C-V4 split M then competing R never becomes complete members', async () => {
    await withLog(async log => {
      const initial = anchors()
      await log.append(
        session,
        initial.entries.map(({ session: _session, position: _position, ...entry }) => entry),
        fence,
        condition,
      )
      const external = batch()
      const message = external[0]
      if (message === undefined) throw new Error('external message')
      expect(await log.append(session, [message], fence, condition)).toHaveProperty('positions')
      const competing = batch({ ...response, replyDisposition: { consumed: { by: 'side_query' } } })
      expect(await log.append(session, competing, fence, condition)).toHaveProperty('positions')
      expect(inspected(readable(await log.readSince(session, 0)))).not.toHaveProperty(
        'completeMembers',
      )
      expect(await log.append(session, external.slice(1), fence, condition)).toHaveProperty(
        'failure',
        'alreadyRecorded',
      )
    })
  })
  it('H1 once [M,R] and H2 separate [M]/[R] have identical full and keyed public read surfaces', async () => {
    const surfaces = await Promise.all(
      [true, false].map(together =>
        withLog(async log => {
          const initial = anchors()
          await log.append(
            session,
            initial.entries.map(({ session: _session, position: _position, ...entry }) => entry),
            fence,
            condition,
          )
          const complete = batch()
          if (together) await log.append(session, complete, fence, condition)
          else for (const entry of complete) await log.append(session, [entry], fence, condition)
          const full = readable(await log.readSince(session, 0))
          const queries = await Promise.all(
            [...new Set(complete.flatMap(entry => entry.readKeys))].map(key =>
              log.readByKey(session, key),
            ),
          )
          return { full, queries, members: inspected(full) }
        }),
      ),
    )
    const left = surfaces[0],
      right = surfaces[1]
    if (
      left === undefined ||
      right === undefined ||
      !('completeMembers' in left.members) ||
      !('completeMembers' in right.members)
    )
      throw new Error('expected controlled legal surfaces')
    expect(
      modelLogJsonEqual(
        { full: left.full, queries: left.queries },
        { full: right.full, queries: right.queries },
      ),
    ).toBe(true)
    expect(writeJsonLossless(left.members.completeMembers.response.value)).toBe(
      writeJsonLossless(right.members.completeMembers.response.value),
    )
    expect(writeJsonLossless(left.members.completeMembers.message?.value ?? null)).toBe(
      writeJsonLossless(right.members.completeMembers.message?.value ?? null),
    )
    expect(left.members).not.toHaveProperty('physicalBatch')
  })
})
