// AD-04 reads the model view with the cursors session-storage-sql issues (K-18). The Session here
// is the session-storage-sql port over the node:sqlite double that runs the published modules, so
// its `readModelView` cursors are sealed and opaque; the memory session of `./testing` continues
// after a row number and hides what these cases check. What is checked: a read across pages sends
// Session only the cursors Session issued; a reader that holds the cursor of its previous read
// reads, round after round, a number of rows that does not grow with the history (E9); without a
// kept cursor (another source fiber, a cursor Session refuses, another epoch) the read starts at
// the beginning of the epoch and still answers exactly the rows after the cursor.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import type {
  Access,
  ContextHolderParts,
  HistoryEvidence,
  HistoryReadResult,
} from '@omne-harness/request-context-cordis-contract'
import type { HistoryCursor } from '@omne-harness/request-context-contract'
import { contextHolderSourcesKey } from '@omne-harness/request-context-cordis-contract/cordis'
import type { ModelViewRead, SessionAccess, SessionFaces } from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionHistorySource } from '../src/cordis/history-source.ts'
import { ok } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

type ModelViewInput = Parameters<SessionFaces<unknown>['history']['readModelView']>[0]
type Sent = Readonly<{ after: string | null; rows: number }>

/** What the Session service of one world does besides answering. */
type Script = {
  /** Answer `invalid` to the next call that carries a cursor. */
  refuseNextCursor: boolean
  /** The epoch text a reader sees in place of the real one, from now on. */
  alias: string | null
}

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

let scenes = 0

async function world() {
  const s = await sqlScene(`history-cursor-${++scenes}`)
  disposers.push(() => s.close())
  ok(await s.view.journal.open(s.openInput))
  const head = ok(await s.view.journal.load({ ...s.access, execution: s.execution })).history
  const history = (s.port as unknown as SessionFaces<unknown>).history
  const work = s.port as unknown as SessionFaces<unknown>['work']
  const sent: Sent[] = []
  const issued = new Set<string>()
  const script: Script = { refuseNextCursor: false, alias: null }
  let real: string | null = null

  async function readModelView(input: ModelViewInput) {
    if (input.after !== null && script.refuseNextCursor) {
      script.refuseNextCursor = false
      sent.push({ after: input.after, rows: 0 })
      return { failure: { kind: 'invalid', field: 'cursor', reason: 'expired' } } as never
    }
    const basis =
      input.basis !== null && script.alias !== null && input.basis.epoch === script.alias
        ? { ...input.basis, epoch: real ?? input.basis.epoch }
        : input.basis
    const answer = await history.readModelView({ ...input, basis })
    if (!('ok' in answer)) return answer
    const view: ModelViewRead = answer.ok
    if (view.kind !== 'page') return answer
    real = view.basis.epoch
    sent.push({ after: input.after, rows: view.rows.length })
    if (view.next !== null) issued.add(view.next)
    const seen =
      script.alias === null ? view : { ...view, basis: { ...view.basis, epoch: script.alias } }
    return { ok: seen }
  }

  class Session extends SessionService<unknown> {
    get history(): SessionFaces<unknown>['history'] {
      return { ...history, readModelView } as SessionFaces<unknown>['history']
    }
    get work(): SessionFaces<unknown>['work'] {
      return {
        readWork: (input: SessionAccess<unknown>) => work.readWork(input as never),
      } as unknown as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
  }
  const ctx = new Context()
  const mount = async (plugin: Parameters<Context['plugin']>[0]) => {
    const fiber = await ctx.plugin(plugin)
    disposers.push(() => fiber.dispose())
    return fiber
  }
  const source = () =>
    createSessionHistorySource({
      heads: {
        sessionOf: value =>
          value.record === head.record
            ? { tenant: s.access.tenant, session: s.access.session }
            : null,
      },
    })
  await mount(Session)
  const ad04 = source()
  await mount(ad04.lowerBound)
  const fiber = await mount(ad04.source)

  /** One lease of the current source fiber. */
  async function borrow(): Promise<ContextHolderParts<unknown>> {
    let parts: ContextHolderParts<unknown> | undefined
    await mount({
      name: 'history-cursor-borrower',
      inject: [contextHolderSourcesKey],
      apply(inner: Context) {
        const result = inner.contextHolderSources.lease({
          settle: async () => ({ kind: 'settled' }),
        })
        if (result.kind !== 'leased') throw new Error(`no lease: ${result.diagnostic}`)
        parts = result.lease.parts
      },
    })
    if (parts === undefined) throw new Error('the borrower did not run')
    return parts
  }

  /** Replaces the source fiber: the new one has kept no cursor. */
  async function restart() {
    await fiber.dispose()
    const again = source()
    await mount(again.lowerBound)
    await mount(again.source)
  }

  /** Commits `count` model-visible system reminders; each one is a new model view row. */
  async function remind(count: number, tag: string) {
    for (let index = 0; index < count; index++) {
      const judged = judgeMessage({
        id: `msg_${tag}-${String(index).padStart(21 - tag.length, '0')}`,
        role: 'system_reminder',
        blocks: [
          {
            kind: 'text',
            id: `b-${tag}-${index}`,
            text: `reminder ${tag} ${index}`,
            visibility: { toHuman: false, toModel: true },
          },
        ],
      })
      if (!('ok' in judged)) throw new Error('fixture: reminder')
      const snapshot = ok(await s.port.readWork(s.sessionAccess))
      ok(
        await s.port.commit({
          access: s.sessionAccess,
          command: {
            kind: 'commitDerived',
            input: {
              tenant: s.access.tenant,
              session: s.access.session,
              operation: operationId(`remind-${tag}-${index}`),
              expected: snapshot.revision,
              value: {
                kind: 'context-reminder',
                message: judged.ok,
                source: evidence(`remind-${tag}-${index}`),
              },
            },
          },
          guards: [],
        }),
      )
    }
  }

  const access: Access<unknown> = { principal: s.access.principal, tenant: s.access.tenant }
  async function resolved(parts: ContextHolderParts<unknown>): Promise<HistoryEvidence> {
    const answer = await parts.resolveHistory({ access, evidence: head })
    if (answer.kind !== 'value') throw new Error(`not resolved: ${JSON.stringify(answer)}`)
    return answer.value
  }

  /** The history rows after `cursor` under `ev`, page by page, and what Session was asked. */
  async function readAfter(
    parts: ContextHolderParts<unknown>,
    ev: HistoryEvidence,
    from: HistoryCursor | null,
    budgetBytes = 100000,
  ) {
    const before = sent.length
    const seqs: string[] = []
    let cursor = from
    for (let pages = 0; pages < 200; pages++) {
      const answer: HistoryReadResult = await parts.history.read({
        access,
        evidence: ev,
        cursor,
        budgetBytes,
      })
      if (answer.kind !== 'page') throw new Error(`not a page: ${JSON.stringify(answer)}`)
      seqs.push(...answer.page.rows.map(row => row.seq))
      if (answer.page.next === null) {
        const asked = sent.slice(before)
        return { seqs, asked, rows: asked.reduce((sum, item) => sum + item.rows, 0) }
      }
      cursor = answer.page.next
    }
    throw new Error('the read did not end')
  }

  return { s, script, issued, borrow, restart, remind, resolved, readAfter }
}

type World = Awaited<ReturnType<typeof world>>

const upperOf = (ev: HistoryEvidence) => (ev.upper.kind === 'entry' ? ev.upper.seq : null)
const cursorAfter = (ev: HistoryEvidence, after: string | null): HistoryCursor | null =>
  after === null ? null : { evidence: ev, after: after as never }
const seqsFrom = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, index) => String(first + index))

/** The rows Session served for each of `rounds` rounds of two new rows after `rows` rows. */
async function rounds(w: World, rows: number, count: number) {
  const parts = await w.borrow()
  await w.remind(rows - 1, 'base')
  let ev = await w.resolved(parts)
  expect((await w.readAfter(parts, ev, null)).seqs).toEqual(seqsFrom(0, rows - 1))
  const served: number[] = []
  for (let round = 0; round < count; round++) {
    const previous = upperOf(ev)
    await w.remind(2, `round${round}`)
    ev = await w.resolved(parts)
    const read = await w.readAfter(parts, ev, cursorAfter(ev, previous))
    const upper = Number(upperOf(ev))
    expect(read.seqs).toEqual(seqsFrom(upper - 1, upper))
    served.push(read.rows)
  }
  return served
}

describe('AD-04 over the cursors session-storage-sql issues', () => {
  it('reads across pages and sends Session only the cursors Session issued', async () => {
    const w = await world()
    const parts = await w.borrow()
    await w.remind(6, 'page')
    const ev = await w.resolved(parts)
    const read = await w.readAfter(parts, ev, null, 1)
    expect(read.seqs).toEqual(seqsFrom(0, 6))
    const cursors = read.asked.map(item => item.after).filter(after => after !== null)
    expect(cursors.length).toBeGreaterThan(0)
    for (const after of cursors) expect(w.issued.has(after)).toBe(true)
  })

  it('reads, round after round, a number of rows that does not grow with the history (E9)', async () => {
    const small = await rounds(await world(), 4, 3)
    const large = await rounds(await world(), 40, 3)
    expect(large).toEqual(small)
    // Each round: the row before the cursor and the two new rows, then the row before the new
    // upper bound once more for the cursor of the next round.
    for (const count of small) expect(count).toBeLessThanOrEqual(5)
  })

  it('a source fiber that kept no cursor reads from the start and answers the rows after the cursor', async () => {
    const w = await world()
    let parts = await w.borrow()
    await w.remind(9, 'cold')
    const ev = await w.resolved(parts)
    await w.restart()
    parts = await w.borrow()
    const again = await w.resolved(parts)
    const read = await w.readAfter(parts, again, cursorAfter(again, '6'))
    expect(read.seqs).toEqual(['7', '8', '9'])
    expect(read.asked[0]?.after).toBeNull()
    expect(read.rows).toBeGreaterThanOrEqual(10)
    expect(upperOf(again)).toBe(upperOf(ev))
  })

  it('a kept cursor Session refuses is forgotten; the read starts again from the start', async () => {
    const w = await world()
    const parts = await w.borrow()
    await w.remind(5, 'refused')
    let ev = await w.resolved(parts)
    await w.readAfter(parts, ev, null)
    const previous = upperOf(ev)
    await w.remind(2, 'refused-more')
    ev = await w.resolved(parts)
    w.script.refuseNextCursor = true
    const read = await w.readAfter(parts, ev, cursorAfter(ev, previous))
    expect(read.seqs).toEqual(['6', '7'])
    expect(read.asked[0]?.rows).toBe(0)
    expect(read.asked[1]?.after).toBeNull()
  })

  it('under another epoch it sends none of the cursors of the earlier one', async () => {
    const w = await world()
    const parts = await w.borrow()
    await w.remind(5, 'epoch')
    let ev = await w.resolved(parts)
    await w.readAfter(parts, ev, null)
    const previous = upperOf(ev)
    await w.remind(2, 'epoch-more')
    w.script.alias = 'another-epoch'
    ev = await w.resolved(parts)
    expect(ev.epoch).toBe('another-epoch')
    const read = await w.readAfter(parts, ev, cursorAfter(ev, previous))
    expect(read.seqs).toEqual(['6', '7'])
    expect(read.asked[0]?.after).toBeNull()
  })

  it('a read from the start still advances when the cursor table is full of higher cursors', async () => {
    // 420 rows are more than two store pages of 200. Eighteen rounds of one new row each leave the
    // table full of cursors above the first page; the first page's own cursor is the lowest, and
    // the cursor table keeps 16 of them.
    const w = await world()
    const parts = await w.borrow()
    await w.remind(420, 'full')
    let ev = await w.resolved(parts)
    expect((await w.readAfter(parts, ev, null)).seqs).toEqual(seqsFrom(0, 420))
    for (let round = 0; round < 18; round++) {
      const previous = upperOf(ev)
      await w.remind(1, `full-more${round}`)
      ev = await w.resolved(parts)
      await w.readAfter(parts, ev, cursorAfter(ev, previous))
    }
    const upper = Number(upperOf(ev))
    const cold = await w.readAfter(parts, ev, null)
    expect(cold.seqs).toEqual(seqsFrom(0, upper))
    // One call for each page of 200 rows, and a call or two for the cursor of the next round.
    expect(cold.asked.length).toBeLessThanOrEqual(Math.ceil((upper + 1) / 200) + 3)
    // The cursors the cold read just got are the ones kept, not the lowest of them dropped at
    // once: a read after the second page starts at the cursor Session issued there.
    const tail = await w.readAfter(parts, ev, cursorAfter(ev, '399'))
    expect(tail.seqs).toEqual(seqsFrom(400, upper))
    expect(tail.asked[0]?.after).not.toBeNull()
    expect(tail.asked.length).toBeLessThanOrEqual(2)
  }, 60000)
})
