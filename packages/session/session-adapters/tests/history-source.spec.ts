// AD-04 on real Cordis 4.0.4: the Request Context history source of Session and its K-RQ parts.
// What is checked: the source sub-plugin passes the `contextHolderSources` suite (four parts, the
// pulled settlement, reads that stay open until every settlement has ended); the history reads
// call Session as `reader` and `readWork` as `coordinator`, both with the access of the call;
// another tenant is denied before any Session call; the model view translates to the Request
// Context history (escaped epoch, canonical sequences, a cursor bound to its evidence, a fixed
// upper bound, epoch changes, no empty page for a failure); the compaction window is cut at the
// fixed upper bound and needs the lower bound sub-plugin; the eligibility bridge and the narrow
// adoption source check the access of every call; a tail page costs the same at N = 10 and N = 100
// rows (SS-21); both sub-plugins stay absent without `session`, and the lent reads answer
// unavailable once they have closed.
//
// Session is this member's memory session (`./testing`) behind a scripted Session service; the
// history head decoder is a scripted double, because its production provider is a named gap.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import type {
  Access,
  AdoptedRequestSource,
  ContextHolderParts,
  DurableEvidence,
  GroupToken,
  HistoryEvidence,
  HistoryReadResult,
} from '@omne-harness/request-context-cordis-contract'
import {
  ContextHolderSourcesService,
  contextHolderSourcesKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import {
  contextHolderSourcesConformance,
  type ContextHolderSourcesFixture,
} from '@omne-harness/request-context-cordis-contract/testing'
import type {
  ModelViewRead,
  SessionAccess,
  SessionFaces,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, memoryOtherAccess, operationId } from '@omne-harness/session-contract/testing'
import { SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionHistorySource } from '../src/cordis/history-source.ts'
import { ok, scene, type SceneQualification } from './fixtures/common-journal.ts'

// --- the fixture -----------------------------------------------------------------------------------

type Call = Readonly<{ method: string; caller: unknown; principal: unknown }>
type Faults = {
  /** Answer `epoch-changed` from the model view read with this number (1-based). */
  epochChangedAt: number | null
  /** The `readWork` answer gets this `contextScopes` value. */
  scopes?: WorkSnapshot['contextScopes']
}
type Mounted = 'session' | 'lowerBound' | 'source'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

let sessions = 0

/**
 * A memory session with one active run, the Session service over it (every call records its
 * method, caller class and principal), the two AD-04 sub-plugins and a history head decoder that
 * knows the head of the run's execution.
 */
async function world(
  options: Readonly<{
    ctx?: Context
    mount?: readonly Mounted[]
    adopted?: AdoptedRequestSource<unknown>
  }> = {},
) {
  const qualification: { -readonly [K in keyof SceneQualification]: SceneQualification[K] } = {
    agent: true,
    session: true,
  }
  const s = await scene(`history-session-${++sessions}`, undefined, qualification)
  const port = s.backend.transactions
  const calls: Call[] = []
  const faults: Faults = { epochChangedAt: null }
  const modelViewRows: number[] = []
  let views = 0

  const historyOf = (caller: unknown): SessionFaces<unknown>['history'] => {
    const record = (method: string, input: { principal: unknown }) =>
      calls.push({ method, caller, principal: input.principal })
    const history = port.history as unknown as SessionFaces<unknown>['history']
    return {
      begin: input => (record('history.begin', input), history.begin(input)),
      next: input => (record('history.next', input), history.next(input)),
      since: input => (record('history.since', input), history.since(input)),
      readModelView: async input => {
        record('history.readModelView', input)
        views++
        const answer = await history.readModelView(input)
        if ('ok' in answer && answer.ok.kind === 'page') {
          modelViewRows.push(answer.ok.rows.length)
          if (faults.epochChangedAt === views) {
            const changed: ModelViewRead = {
              kind: 'epoch-changed',
              current: { epoch: `${answer.ok.basis.epoch}+1`, upper: '1' },
            }
            return { ok: changed }
          }
        }
        return answer
      },
    }
  }
  const readWork = async (input: SessionAccess<unknown>) => {
    const answer = await (port as unknown as SessionFaces<unknown>['work']).readWork(input)
    if (!('ok' in answer) || faults.scopes === undefined) return answer
    return { ok: { ...answer.ok, contextScopes: faults.scopes } }
  }
  class Session extends SessionService<unknown> {
    get history(): SessionFaces<unknown>['history'] {
      return historyOf(this[Service.resolveConfig]())
    }
    get work(): SessionFaces<unknown>['work'] {
      const caller = this[Service.resolveConfig]()
      return {
        readWork: async (input: SessionAccess<unknown>) => {
          calls.push({ method: 'work.readWork', caller, principal: input.principal })
          return readWork(input)
        },
      } as unknown as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
  }

  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  const head: DurableEvidence = loaded.history
  const ad04 = createSessionHistorySource({
    heads: {
      sessionOf: evidence =>
        evidence.record === head.record
          ? { tenant: s.access.tenant, session: s.access.session }
          : null,
    },
    ...(options.adopted === undefined ? {} : { adopted: options.adopted }),
  })

  const ctx = options.ctx ?? new Context()
  const fibers = new Map<Mounted, Awaited<ReturnType<Context['plugin']>>>()
  const plugins = { session: Session, lowerBound: ad04.lowerBound, source: ad04.source } as const
  for (const name of options.mount ?? (['session', 'lowerBound', 'source'] as const)) {
    const fiber = await ctx.plugin(plugins[name])
    disposers.push(() => fiber.dispose())
    fibers.set(name, fiber)
  }

  /** A borrower plugin that takes one lease; its settlement is ready at once. */
  async function borrow() {
    let parts: ContextHolderParts<unknown> | undefined
    let release: (() => void) | undefined
    let settled = 0
    const fiber = await ctx.plugin({
      name: 'history-source-spec-borrower',
      inject: [contextHolderSourcesKey],
      apply(inner: Context) {
        const result = inner.contextHolderSources.lease({
          settle: async () => {
            settled++
            return { kind: 'settled' }
          },
        })
        if (result.kind !== 'leased') throw new Error(`no lease: ${result.diagnostic}`)
        parts = result.lease.parts
        release = result.lease.release
      },
    })
    disposers.push(() => fiber.dispose())
    if (parts === undefined || release === undefined) throw new Error('the borrower did not run')
    return { parts, release, fiber, settled: () => settled }
  }

  /** Commits `count` model-visible system reminders; each one is a new model view row. */
  async function remind(count: number, tag = 'r') {
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
      const work = ok(await port.readWork(s.access))
      ok(
        await port.commit({
          access: s.access,
          command: {
            kind: 'commitDerived',
            input: {
              tenant: s.access.tenant,
              session: s.access.session,
              operation: operationId(`remind-${tag}-${index}`),
              expected: work.revision,
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
  return {
    s,
    ctx,
    ad04,
    fibers,
    calls,
    faults,
    qualification,
    head,
    access,
    borrow,
    remind,
    modelViewRows,
    sessionCalls: () => calls.length,
  }
}

type World = Awaited<ReturnType<typeof world>>

async function resolved(
  w: World,
  parts: ContextHolderParts<unknown>,
  access: Access<unknown> = w.access,
): Promise<HistoryEvidence> {
  const answer = await parts.resolveHistory({ access, evidence: w.head })
  if (answer.kind !== 'value') throw new Error(`not resolved: ${JSON.stringify(answer)}`)
  return answer.value
}

async function readAll(parts: ContextHolderParts<unknown>, access: unknown, ev: HistoryEvidence) {
  const seqs: string[] = []
  let cursor = null
  for (let pages = 0; pages < 100; pages++) {
    const answer: HistoryReadResult = await parts.history.read({
      access: access as Access<unknown>,
      evidence: ev,
      cursor,
      budgetBytes: 1,
    })
    if (answer.kind !== 'page') throw new Error(`not a page: ${JSON.stringify(answer)}`)
    seqs.push(...answer.page.rows.map(row => row.seq))
    if (answer.page.next === null) return seqs
    cursor = answer.page.next
  }
  throw new Error('the read did not end')
}

const intruder = memoryOtherAccess<unknown>('intruder')
const intruderAccess: Access<unknown> = { principal: 'intruder', tenant: intruder.tenant }

const token = 'adopted-1' as GroupToken
function handedAdopted() {
  const asked: string[] = []
  const source: AdoptedRequestSource<unknown> = {
    authority: { owner: 'test', name: 'fixed-requests', revision: '1', digest: 'test:fixed' },
    readCount: async () => (asked.push('readCount'), { kind: 'value', value: token }),
    readSource: async () => (asked.push('readSource'), { kind: 'value', value: null }),
  }
  return { source, asked }
}

// --- K-RQ ------------------------------------------------------------------------------------------

describe('contextHolderSources conformance against the AD-04 source sub-plugin', () => {
  const fixture: ContextHolderSourcesFixture<unknown> = {
    async start(ctx) {
      const w = await world({ ctx, adopted: handedAdopted().source })
      const resolve = async (parts: ContextHolderParts<unknown>, access: Access<unknown>) =>
        parts.resolveHistory({ access, evidence: w.head })
      return {
        access: w.access,
        stop: async () => {
          await w.fibers.get('source')?.dispose()
        },
        readsClosed: () => w.ad04.readsClosed(),
        revoke() {
          w.qualification.session = false
        },
        calls: {
          history: {
            async call(parts, access) {
              const head = await resolve(parts, access)
              if (head.kind !== 'value') return head
              return parts.history.read({
                access,
                evidence: head.value,
                cursor: null,
                budgetBytes: 1,
              })
            },
            admitted: 'page',
          },
          adopted: {
            async call(parts, access) {
              const head = await resolve(parts, access)
              if (head.kind !== 'value') return head
              return parts.adopted.readCount({ access, target: head.value.target })
            },
            admitted: 'value',
          },
          eligibility: {
            async call(parts, access) {
              const head = await resolve(parts, access)
              if (head.kind !== 'value') return head
              return parts.eligibility.check({
                access,
                target: head.value.target,
                operation: 'history',
              })
            },
            admitted: 'allowed',
          },
          resolveHistory: { call: resolve, admitted: 'value' },
        },
      }
    },
  }
  for (const item of contextHolderSourcesConformance(fixture)) it(item.name, () => item.run())
})

// --- identity and tenants --------------------------------------------------------------------------

describe('every Session call carries the access of the part call', () => {
  it('reads the history as reader and readWork as coordinator, with the principal of the access', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    const ev = await resolved(w, parts)
    await readAll(parts, w.access, ev)
    const methods = new Set(w.calls.map(call => call.method))
    expect(methods).toEqual(new Set(['work.readWork', 'history.readModelView']))
    for (const call of w.calls) {
      expect(call.principal).toBe('tester')
      expect(call.caller).toEqual({
        caller: call.method === 'work.readWork' ? 'coordinator' : 'reader',
      })
    }
  })

  it('denies another tenant in every part before any Session call', async () => {
    const w = await world({ adopted: handedAdopted().source })
    const { parts } = await w.borrow()
    const ev = await resolved(w, parts)
    const before = w.sessionCalls()
    expect(await parts.resolveHistory({ access: intruderAccess, evidence: w.head })).toEqual({
      kind: 'denied',
    })
    expect(
      await parts.history.read({
        access: intruderAccess,
        evidence: ev,
        cursor: null,
        budgetBytes: 9,
      }),
    ).toEqual({ kind: 'denied' })
    expect(
      await parts.history.compactionContext({
        access: intruderAccess,
        evidence: ev,
        coverTo: '3' as never,
      }),
    ).toEqual({ kind: 'denied' })
    expect(
      await parts.eligibility.check({
        access: intruderAccess,
        target: ev.target,
        operation: 'history',
      }),
    ).toEqual({ kind: 'denied' })
    expect(await parts.adopted.readSource({ access: intruderAccess, target: ev.target })).toEqual({
      kind: 'denied',
    })
    expect(w.sessionCalls()).toBe(before)
  })
})

// --- the history read ------------------------------------------------------------------------------

describe('the history read translates the Session model view', () => {
  it('resolves a head to the current scope, an escaped epoch and the canonical upper bound', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(2)
    const ev = await resolved(w, parts)
    const scopes = ok(await w.s.backend.transactions.readWork(w.s.access)).contextScopes ?? []
    expect(ev.target.scope.ref).toBe(scopes.at(-1)?.scope)
    expect(ev.upper).toEqual({ kind: 'entry', seq: '3' })
    // The Session epoch holds a control character; the EpochId writes it as %00.
    expect(ev.epoch).toContain('%00')
    expect(ev.epoch).not.toContain('\u0000')
  })

  it('pages the rows of the fixed upper bound in order, with no row after it and no sourceCall', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(3)
    const ev = await resolved(w, parts)
    await w.remind(2, 'late')
    expect(await readAll(parts, w.access, ev)).toEqual(['1', '2', '3', '4'])
    const first = await parts.history.read({
      access: w.access,
      evidence: ev,
      cursor: null,
      budgetBytes: 1,
    })
    if (first.kind !== 'page') throw new Error('not a page')
    const [row] = first.page.rows
    expect(row).toMatchObject({ seq: '1', entry: '3', message: { role: 'user' } })
    expect(typeof row?.bytes).toBe('string')
    expect(row).not.toHaveProperty('sourceCall')
    expect(first.page.next).toEqual({ evidence: ev, after: '1' })
  })

  it('refuses a cursor of another evidence and a malformed upper bound without a Session call', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(2)
    const ev = await resolved(w, parts)
    const before = w.sessionCalls()
    const other: HistoryEvidence = { ...ev, upper: { kind: 'entry', seq: '2' as never } }
    expect(
      await parts.history.read({
        access: w.access,
        evidence: ev,
        cursor: { evidence: other, after: '1' as never },
        budgetBytes: 9,
      }),
    ).toEqual({ kind: 'invalid', field: 'cursor', reason: 'cursor-invalidated' })
    expect(
      await parts.history.read({
        access: w.access,
        evidence: { ...ev, upper: { kind: 'entry', seq: '01' as never } },
        cursor: null,
        budgetBytes: 9,
      }),
    ).toEqual({ kind: 'invalid', field: 'evidence', reason: 'upper-out-of-range' })
    expect(w.sessionCalls()).toBe(before)
  })

  it('answers a scope it has not resolved unavailable, without a Session call', async () => {
    const w = await world()
    const other = await world()
    const { parts } = await w.borrow()
    const theirs = await resolved(other, (await other.borrow()).parts)
    const answer = await parts.history.read({
      access: w.access,
      evidence: theirs,
      cursor: null,
      budgetBytes: 9,
    })
    expect(answer.kind).toBe('unavailable')
    expect(w.sessionCalls()).toBe(0)
  })

  it('passes an epoch change on with the current evidence and a Session failure as unavailable', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    const ev = await resolved(w, parts)
    w.faults.epochChangedAt = w.calls.filter(c => c.method === 'history.readModelView').length + 1
    const changed = await parts.history.read({
      access: w.access,
      evidence: ev,
      cursor: null,
      budgetBytes: 9,
    })
    expect(changed).toEqual({
      kind: 'epoch-changed',
      current: { target: ev.target, epoch: `${ev.epoch}+1`, upper: { kind: 'entry', seq: '1' } },
    })
    w.qualification.session = 'unavailable'
    const down = await parts.history.read({
      access: w.access,
      evidence: ev,
      cursor: null,
      budgetBytes: 9,
    })
    expect(down.kind).toBe('unavailable')
  })
})

describe('the history head resolver', () => {
  it('answers evidence it does not know invalid and a session whose scope ended unavailable', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    const unknown = { ...w.head, record: 'another-head' }
    expect(await parts.resolveHistory({ access: w.access, evidence: unknown })).toEqual({
      kind: 'invalid',
      field: 'evidence',
      reason: 'source-evidence-conflict',
    })
    const scopes = ok(await w.s.backend.transactions.readWork(w.s.access)).contextScopes ?? []
    w.faults.scopes = scopes.map(scope => ({ ...scope, ended: evidence('archived') }))
    const ended = await parts.resolveHistory({ access: w.access, evidence: w.head })
    expect(ended).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(ended)).toContain('ended')
  })

  it('answers unavailable while the lower bound sub-plugin is absent', async () => {
    const w = await world({ mount: ['session', 'source'] })
    const { parts } = await w.borrow()
    const answer = await parts.resolveHistory({ access: w.access, evidence: w.head })
    expect(answer).toEqual({
      kind: 'unavailable',
      diagnostic: 'the lower bound sub-plugin is not running',
    })
    expect(w.calls.some(call => call.method === 'work.readWork')).toBe(false)
  })
})

// --- the compaction window -------------------------------------------------------------------------

describe('the compaction window', () => {
  it('holds the covered prefix and the tail up to the fixed upper bound, with the open lower bound', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(3)
    const ev = await resolved(w, parts)
    await w.remind(1, 'late')
    const answer = await parts.history.compactionContext({
      access: w.access,
      evidence: ev,
      coverTo: '7' as never,
    })
    if (answer.kind !== 'context') throw new Error(JSON.stringify(answer))
    expect(answer.evidence).toEqual(ev)
    expect(answer.value.base).toEqual({ kind: 'initial' })
    expect(answer.value.covered.map(row => row.ref)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    // Entry 10, the late reminder, is after the fixed upper bound (entry 9).
    expect(answer.value.after.map(row => row.ref)).toEqual(['8', '9'])
    for (const ref of answer.value.open) expect(Number(ref)).toBeLessThanOrEqual(9)
    expect(w.calls.filter(c => c.method === 'work.readWork').at(-1)?.caller).toEqual({
      caller: 'coordinator',
    })
  })

  it('refuses a cover beyond the upper bound and answers a changed epoch between its reads', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(1)
    const ev = await resolved(w, parts)
    await w.remind(1, 'late')
    expect(
      await parts.history.compactionContext({
        access: w.access,
        evidence: ev,
        coverTo: '8' as never,
      }),
    ).toEqual({ kind: 'invalid', field: 'coverTo', reason: 'upper-out-of-range' })
    // The second model view read of the next call is the confirmation after the window.
    w.faults.epochChangedAt = w.calls.filter(c => c.method === 'history.readModelView').length + 2
    const changed = await parts.history.compactionContext({
      access: w.access,
      evidence: ev,
      coverTo: '7' as never,
    })
    expect(changed.kind).toBe('epoch-changed')
  })

  it('answers unavailable while the lower bound sub-plugin is absent', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    const ev = await resolved(w, parts)
    await w.fibers.get('lowerBound')?.dispose()
    const answer = await parts.history.compactionContext({
      access: w.access,
      evidence: ev,
      coverTo: '3' as never,
    })
    expect(answer).toEqual({
      kind: 'unavailable',
      diagnostic: 'the lower bound sub-plugin is not running',
    })
  })
})

// --- eligibility and the narrow adoption source ----------------------------------------------------

describe('the read eligibility bridge and the narrow adoption source', () => {
  it('allow while Session admits the access, and deny or answer unavailable as Session does', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    const { target } = await resolved(w, parts)
    const check = () => parts.eligibility.check({ access: w.access, target, operation: 'history' })
    expect(await check()).toMatchObject({ kind: 'allowed' })
    w.qualification.session = 'unavailable'
    expect(await check()).toMatchObject({ kind: 'unavailable' })
    w.qualification.session = false
    expect(await check()).toEqual({ kind: 'denied' })
  })

  it('reads the handed fixed request facts only for an admitted access', async () => {
    const handed = handedAdopted()
    const w = await world({ adopted: handed.source })
    const { parts } = await w.borrow()
    const { target } = await resolved(w, parts)
    expect(parts.adopted.authority).toEqual(handed.source.authority)
    expect(await parts.adopted.readCount({ access: w.access, target })).toEqual({
      kind: 'value',
      value: token,
    })
    w.qualification.session = false
    expect(await parts.adopted.readSource({ access: w.access, target })).toEqual({ kind: 'denied' })
    expect(handed.asked).toEqual(['readCount'])
  })

  it('answers unavailable after the access check when no fixed request facts are handed in', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    const { target } = await resolved(w, parts)
    const answer = await parts.adopted.readSource({ access: w.access, target })
    expect(answer).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(answer)).toContain('adopted-facts-absent')
    w.qualification.session = false
    expect(await parts.adopted.readSource({ access: w.access, target })).toEqual({ kind: 'denied' })
  })
})

// --- SS-21 -----------------------------------------------------------------------------------------

describe('SS-21: a page after the cursor costs the same at N = 10 and N = 100 rows', () => {
  async function tail(rows: number) {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(rows - 1)
    const ev = await resolved(w, parts)
    const calls = w.sessionCalls()
    const served = w.modelViewRows.length
    const after = String(rows - 2) as never
    const answer = await parts.history.read({
      access: w.access,
      evidence: ev,
      cursor: { evidence: ev, after },
      budgetBytes: 400,
    })
    if (answer.kind !== 'page') throw new Error(JSON.stringify(answer))
    return {
      calls: w.sessionCalls() - calls,
      rows: w.modelViewRows.slice(served).reduce((sum, count) => sum + count, 0),
      returned: answer.page.rows.map(row => row.seq),
    }
  }

  it('reads one model view page holding only the rows after the cursor', async () => {
    const small = await tail(10)
    const large = await tail(100)
    expect(small.calls).toBe(1)
    expect(large.calls).toBe(1)
    expect(small.rows).toBe(large.rows)
    expect(small.returned).toEqual(['9', '10'])
    expect(large.returned).toEqual(['99', '100'])
  })

  it('negative control: reading the history from the start grows with N', async () => {
    const pagesOf = async (rows: number) => {
      const w = await world()
      const { parts } = await w.borrow()
      await w.remind(rows - 1)
      const ev = await resolved(w, parts)
      const calls = w.sessionCalls()
      await readAll(parts, w.access, ev)
      return w.sessionCalls() - calls
    }
    expect(await pagesOf(30)).toBeGreaterThan(await pagesOf(10))
  })
})

// --- lifecycle on real Cordis ----------------------------------------------------------------------

describe('the sub-plugins on real Cordis 4.0.4', () => {
  it('stay absent while session is absent', async () => {
    const ctx = new Context()
    const w = await world({ ctx, mount: ['lowerBound', 'source'] })
    expect(ctx.get(contextHolderSourcesKey)).toBeUndefined()
    expect(w.ad04.readsClosed()).toBe(true)
    const session = await ctx.plugin(
      class extends SessionService<unknown> {
        readonly work = {} as SessionFaces<unknown>['work']
        readonly history = {} as SessionFaces<unknown>['history']
        readonly management = {} as SessionFaces<unknown>['management']
        readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
      },
    )
    disposers.push(() => session.dispose())
    expect(ctx.get(contextHolderSourcesKey)).toBeInstanceOf(ContextHolderSourcesService)
    await session.dispose()
    expect(ctx.get(contextHolderSourcesKey)).toBeUndefined()
  })

  it('closes the lent reads after the settlement, and the parts then answer unavailable', async () => {
    const w = await world()
    const lease = await w.borrow()
    const ev = await resolved(w, lease.parts)
    await w.fibers.get('source')?.dispose()
    expect(lease.settled()).toBe(1)
    expect(w.ad04.readsClosed()).toBe(true)
    const before = w.sessionCalls()
    const answers = [
      await lease.parts.history.read({
        access: w.access,
        evidence: ev,
        cursor: null,
        budgetBytes: 9,
      }),
      await lease.parts.resolveHistory({ access: w.access, evidence: w.head }),
      await lease.parts.eligibility.check({
        access: w.access,
        target: ev.target,
        operation: 'history',
      }),
    ]
    for (const answer of answers) expect(answer.kind).toBe('unavailable')
    expect(w.sessionCalls()).toBe(before)
  })

  it('reruns on a new session provider and lends again', async () => {
    const w = await world()
    const first = await w.borrow()
    await w.fibers.get('session')?.dispose()
    expect(first.settled()).toBe(1)
    expect(w.ctx.get(contextHolderSourcesKey)).toBeUndefined()
    const again = await world({ ctx: w.ctx, mount: ['session'] })
    expect(again.ctx.get(contextHolderSourcesKey)).toBeInstanceOf(ContextHolderSourcesService)
    const second = await w.borrow()
    expect(second.parts).not.toBe(first.parts)
  })
})
