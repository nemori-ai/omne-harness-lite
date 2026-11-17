import { describe, expect, it } from 'vitest'
import { assistantMessage, evidence } from '@omne-harness/session-contract/testing'
import type { EventPage } from '@omne-harness/agent-contract'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { readExecutionRecords } from '../src/cordis/agent-journal.ts'
import { readCurrentExecution } from '../src/cordis/journal-current-read.ts'
import { readerOf } from '../src/cordis/journal-read.ts'
import { tenantCodec } from '@omne-harness/legal-identity'
import { EXECUTION_RECORD_HANDLERS } from '@omne-harness/session-storage-sql/participants'

const PAGE = 5

async function withEvents(name: string, events: number) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  const observer = s.fresh().journal
  ok(await observer.load({ ...s.access, execution: s.execution }))
  const original: {
    input: Parameters<typeof s.view.journal.commit>[0]
    receipt: Awaited<ReturnType<typeof s.view.journal.commit>>
  }[] = []
  for (let index = 0; index < events; index += 1) {
    const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    const input: Parameters<typeof s.view.journal.commit>[0] = {
      ...s.access,
      execution: s.execution,
      operation: operation(`event-${index}`),
      authority: open.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, position: `E${index}` },
      state: { kind: 'advancing' },
      events: [
        {
          kind: 'message',
          message: assistantMessage(`m${index}`),
          source: evidence(`m${index}`),
        },
      ],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }
    const receipt = await s.view.journal.commit(input)
    ok(receipt)
    original.push({ input, receipt })
  }
  return { ...s, original, observer }
}

async function page(s: SqlScene, after: string | null) {
  const reads = s.controls?.reads ?? []
  const start = reads.length
  const result = ok(
    await s.view.journal.output.read({ ...s.access, execution: s.execution, after, limit: PAGE }),
  )
  if (result.kind !== 'page') throw new Error('a page is expected')
  return { reads: reads.length - start, events: result.events.length }
}

describe('reading the unread prefix after the progress mark', () => {
  it('keeps a captured current revision readable when a newer publication arrives while reading immutable facts', async () => {
    const s = await withEvents('current-facts-concurrent-publication', 3)
    try {
      const before = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
      const tenant = tenantCodec.encode(s.access.tenant)
      if (!tenant.ok) throw new Error('valid fixture tenant required')
      const read = readerOf(s.storage, s.domain)
      let appended = false
      const captured = await readCurrentExecution(
        async (handler, input) => {
          if (!appended && handler === EXECUTION_RECORD_HANDLERS.facts) {
            appended = true
            const original = s.original[2]!.input
            ok(
              await s.view.journal.commit({
                ...original,
                operation: operation('concurrent-publication'),
                expected: before.revision,
                events: [],
                checkpoint: { ...before.checkpoint, position: 'newer' },
              }),
            )
          }
          return read(handler, input)
        },
        { tenant: tenant.value, session: s.access.session },
        s.execution,
      )
      expect(appended).toBe(true)
      expect(captured.kind).toBe('read')
      if (captured.kind === 'read') expect(String(captured.view.revision)).toBe(before.revision)
      expect(
        ok(await s.view.journal.load({ ...s.access, execution: s.execution })).checkpoint.position,
      ).toBe('newer')
    } finally {
      await s.close()
    }
  })

  it('refreshes a running reader from current work after another writer advances', async () => {
    const measured: number[] = []
    for (const count of [10, 100]) {
      const s = await withEvents(`current-reader-${count}`, count)
      try {
        ok(
          await s.view.journal.acknowledge({
            ...s.access,
            execution: s.execution,
            operation: operation('ack-all'),
            through: String(count),
            receipt: evidence('consumer'),
          }),
        )
        const traces = s.controls!.sqlReads
        const start = traces.length
        const loaded = ok(await s.observer.load({ ...s.access, execution: s.execution }))
        expect(loaded.checkpoint.position).toBe(`E${count - 1}`)
        measured.push(traces.slice(start).reduce((total, item) => total + item.rows, 0))
      } finally {
        await s.close()
      }
    }
    expect(measured[1]).toBeLessThanOrEqual(measured[0]! + 2)
  })

  it('streams acknowledged output from its original position after cold recovery', async () => {
    const s = await withEvents('current-old-stream', 10)
    const controller = new AbortController()
    try {
      const expected = ok(
        await s.view.journal.output.read({
          ...s.access,
          execution: s.execution,
          after: '0',
          limit: 100,
        }),
      )
      ok(
        await s.view.journal.acknowledge({
          ...s.access,
          execution: s.execution,
          operation: operation('ack-all'),
          through: '10',
          receipt: evidence('consumer'),
        }),
      )
      const iterator = s
        .fresh()
        .journal.output.events({
          ...s.access,
          execution: s.execution,
          after: '0',
          signal: controller.signal,
        })
        [Symbol.asyncIterator]()
      try {
        expect((await iterator.next()).value).toEqual({ ok: expected })
      } finally {
        controller.abort()
        await iterator.return?.()
      }
    } finally {
      await s.close()
    }
  })

  it('reads current execution records without replaying acknowledged history', async () => {
    const measured: number[] = []
    for (const count of [10, 100]) {
      const s = await withEvents(`current-records-${count}`, count)
      try {
        ok(
          await s.view.journal.acknowledge({
            ...s.access,
            execution: s.execution,
            operation: operation('ack-all'),
            through: String(count),
            receipt: evidence('consumer'),
          }),
        )
        const traces = s.controls!.sqlReads
        const start = traces.length
        const records = await readExecutionRecords(
          {
            storage: s.storage,
            tenantDomainLookup: {
              lookup: async () => ({ kind: 'ready' as const, domain: s.domain }),
            },
          },
          { tenant: s.access.tenant, session: s.access.session, execution: s.execution },
        )
        expect(records.kind).toBe('read')
        if (records.kind === 'read')
          expect(records.execution?.checkpoint.position).toBe(`E${count - 1}`)
        measured.push(traces.slice(start).reduce((total, item) => total + item.rows, 0))
      } finally {
        await s.close()
      }
    }
    expect(measured[1]).toBeLessThanOrEqual(measured[0]! + 2)
  })

  it('recalls an old operation after cold recovery without committing its effects again', async () => {
    const s = await withEvents('current-old-operation', 10)
    try {
      const warm = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
      ok(
        await s.view.journal.acknowledge({
          ...s.access,
          execution: s.execution,
          operation: operation('ack-all'),
          through: warm.output.emittedThrough!,
          receipt: evidence('consumer'),
        }),
      )
      const cold = s.fresh().journal
      const old = s.original[0]!
      expect(await cold.commit(old.input)).toEqual(old.receipt)
      expect(ok(await cold.load({ ...s.access, execution: s.execution })).output).toEqual({
        emittedThrough: warm.output.emittedThrough,
        acknowledgedThrough: warm.output.emittedThrough,
      })
    } finally {
      await s.close()
    }
  })

  it('acknowledges delivered output without reading the Session work history', async () => {
    const s = await withEvents('ack-without-work-history', 3)
    try {
      const reads = s.controls?.reads
      if (reads === undefined) throw new Error('read trace required')
      const start = reads.length
      ok(
        await s.view.journal.acknowledge({
          ...s.access,
          execution: s.execution,
          operation: operation('ack-prefix'),
          through: '3',
          receipt: evidence('consumer'),
        }),
      )
      expect(reads.slice(start)).not.toContain('session.work')
      expect(reads.slice(start)).not.toContain('session.work-version')
      expect(reads.slice(start)).not.toContain('session.work-index')
    } finally {
      await s.close()
    }
  })

  it('keeps acknowledged output available by its original range after cold recovery', async () => {
    const s = await withEvents('current-old-output', 10)
    try {
      const expected = await s.view.journal.output.read({
        ...s.access,
        execution: s.execution,
        after: '0',
        limit: PAGE,
      })
      ok(
        await s.view.journal.acknowledge({
          ...s.access,
          execution: s.execution,
          operation: operation('ack-all'),
          through: '10',
          receipt: evidence('consumer'),
        }),
      )
      expect(
        await s
          .fresh()
          .journal.output.read({ ...s.access, execution: s.execution, after: '0', limit: PAGE }),
      ).toEqual(expected)
    } finally {
      await s.close()
    }
  })

  it('checks the original attachment against the current advance without loading Session history', async () => {
    const s = await sqlScene('advance-without-history')
    try {
      const opened = ok(await s.view.journal.open(s.openInput))
      const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
      const reads = s.controls?.reads
      if (reads === undefined) throw new Error('read trace required')
      const start = reads.length
      ok(
        await s.view.journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation('advance'),
          authority: opened.authority,
          expected: loaded.revision,
          checkpoint: { ...loaded.checkpoint, position: 'advance' },
          state: { kind: 'advancing' },
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
          finish: null,
        }),
      )
      expect(reads.slice(start)).not.toContain('session.work')
      expect(reads.slice(start)).not.toContain('session.work-version')
      expect(reads.slice(start)).not.toContain('session.work-index')
    } finally {
      await s.close()
    }
  })

  it('cold-loads the same current checkpoint without reading already acknowledged event bodies', async () => {
    const measured = []
    for (const count of [10, 100]) {
      const s = await withEvents(`cold-current-${count}`, count)
      try {
        const warm = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
        if (warm.output.emittedThrough === null) throw new Error('events required')
        ok(
          await s.view.journal.acknowledge({
            ...s.access,
            execution: s.execution,
            operation: operation('ack-all'),
            through: warm.output.emittedThrough,
            receipt: evidence('consumer'),
          }),
        )
        const traces = s.controls?.sqlReads
        if (traces === undefined) throw new Error('SQL trace required')
        const start = traces.length
        const cold = s.fresh().journal
        const loaded = ok(await cold.load({ ...s.access, execution: s.execution }))
        expect(loaded.checkpoint.position).toBe(`E${count - 1}`)
        expect(loaded.output.acknowledgedThrough).toEqual(loaded.output.emittedThrough)
        measured.push(
          traces.slice(start).reduce(
            (total, trace) => ({
              rows: total.rows + trace.rows,
              bytes: total.bytes + trace.bytes,
            }),
            { rows: 0, bytes: 0 },
          ),
        )
      } finally {
        await s.close()
      }
    }
    expect(measured[1]!.rows).toBeLessThanOrEqual(measured[0]!.rows + 2)
    expect(measured[1]!.bytes).toBeLessThanOrEqual(measured[0]!.bytes + 1024)
  })

  it('takes the same reads and returns the same events at N = 10 and N = 100', async () => {
    const small = await withEvents('complexity-small', 10)
    const large = await withEvents('complexity-large', 100)
    const tailOf = (n: number) => String(n - 2)
    const counts = [await page(small, tailOf(10)), await page(large, tailOf(100))]
    expect(counts[0]).toEqual(counts[1])
    expect(counts[0]!.events).toBeLessThanOrEqual(PAGE)
    expect(counts[0]!.reads).toBe(0)
  })

  it('negative control: walking the whole log from the start grows with N', async () => {
    const small = await withEvents('complexity-walk-small', 10)
    const large = await withEvents('complexity-walk-large', 30)
    const walk = async (s: SqlScene) => {
      let after: string | null = null
      let pages = 0
      for (;;) {
        const result: EventPage = ok(
          await s.view.journal.output.read({
            ...s.access,
            execution: s.execution,
            after,
            limit: PAGE,
          }),
        )
        if (result.kind !== 'page') throw new Error('a page is expected')
        pages += 1
        if (result.caughtUp || result.events.length === 0) return pages
        after = result.next
      }
    }
    expect(await walk(large)).toBeGreaterThan(await walk(small))
  })
})
