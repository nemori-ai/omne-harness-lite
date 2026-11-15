import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import { createContextAccounting } from '@omne-harness/request-context'
import type {
  Access,
  ContextHolderParts,
  DurableEvidence,
  HistoryEvidence,
  HistoryReadResult,
} from '@omne-harness/request-context-cordis-contract'
import {
  decodeRecoveryGrantRef,
  type ContextTarget,
  type HistoryCursor,
} from '@omne-harness/request-context-contract'
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
import type {
  SessionAdoptedRequest,
  SessionAdoptedRequestRead,
  SessionAdoptedRequests,
} from '@omne-harness/session-cordis-contract'
import {
  SessionAdoptedRequestsService,
  SessionService,
  sessionAdoptedRequestsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { createSessionHistorySource } from '../src/cordis/history-source.ts'
import { agentContextReady } from './fixtures/agent-context-ready.ts'
import { invocation, m0Checkpoint, type FixedValues } from './fixtures/adopted-request.ts'
import { ok, scene, type SceneQualification } from './fixtures/common-journal.ts'

type Call = Readonly<{ method: string; caller: unknown; principal: unknown }>
type Faults = {
  epochChangedAt: number | null
  scopes?: WorkSnapshot['contextScopes']
  page?: (page: Extract<ModelViewRead, { kind: 'page' }>) => ModelViewRead
}
type Mounted = 'session' | 'lowerBound' | 'source'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

let sessions = 0

async function world(
  options: Readonly<{
    ctx?: Context
    mount?: readonly Mounted[]
    adopted?: 'absent'
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
          if (faults.page !== undefined) return { ok: faults.page(answer.ok) }
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
  })

  const ctx = options.ctx ?? new Context()
  const logged: { name: string; type: string; text: string }[] = []
  ctx.logger.exporter({
    export: message =>
      logged.push({ name: message.name, type: message.type, text: String(message.args[0]) }),
  })
  const fibers = new Map<Mounted, Awaited<ReturnType<Context['plugin']>>>()
  const provider = scriptedAdoptedRequests()
  if (options.adopted !== 'absent' && ctx.get(sessionAdoptedRequestsKey) === undefined) {
    const fiber = await ctx.plugin(provider.Plugin)
    disposers.push(() => fiber.dispose())
  }
  const plugins = { session: Session, lowerBound: ad04.lowerBound, source: ad04.source } as const
  for (const name of options.mount ?? (['session', 'lowerBound', 'source'] as const)) {
    const fiber = await ctx.plugin(plugins[name])
    disposers.push(() => fiber.dispose())
    fibers.set(name, fiber)
  }

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
    logged,
    qualification,
    head,
    access,
    borrow,
    remind,
    provider,
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

function scriptedAdoptedRequests() {
  const state: {
    saved: SessionAdoptedRequest | null
    answer: SessionAdoptedRequestRead | 'throw' | null
    calls: Readonly<{ access: unknown; session: unknown }>[]
    meanwhile: (() => void) | null
  } = { saved: null, answer: null, calls: [], meanwhile: null }
  class Plugin extends SessionAdoptedRequestsService<unknown> {
    readonly readAdoptedRequest = async (
      input: Parameters<SessionAdoptedRequests<unknown>['readAdoptedRequest']>[0],
    ): Promise<SessionAdoptedRequestRead> => {
      state.calls.push({ access: input.access, session: input.session })
      state.meanwhile?.()
      if (state.answer === 'throw') throw new Error('the provider read threw')
      return state.answer ?? { kind: 'value', value: state.saved }
    }
  }
  return { state, Plugin }
}

describe('contextHolderSources conformance against the history source sub-plugin', () => {
  const fixture: ContextHolderSourcesFixture<unknown> = {
    async start(ctx) {
      const w = await world({ ctx })
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
    const w = await world()
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

describe('the history read translates the Session model view', () => {
  it('resolves a head to the current scope, an escaped epoch and the canonical upper bound', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(2)
    const ev = await resolved(w, parts)
    const scopes = ok(await w.s.backend.transactions.readWork(w.s.access)).contextScopes ?? []
    expect(ev.target.scope.ref).toBe(scopes.at(-1)?.scope)
    expect(ev.upper).toEqual({ kind: 'entry', seq: '2' })
    expect(ev.epoch).toContain('%00')
    expect(ev.epoch).not.toContain('\u0000')
  })

  it('pages the rows of the fixed upper bound in order, with no row after it and no sourceCall', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(3)
    const ev = await resolved(w, parts)
    await w.remind(2, 'late')
    expect(await readAll(parts, w.access, ev)).toEqual(['0', '1', '2', '3'])
    const first = await parts.history.read({
      access: w.access,
      evidence: ev,
      cursor: null,
      budgetBytes: 1,
    })
    if (first.kind !== 'page') throw new Error('not a page')
    const [row] = first.page.rows
    expect(row).toMatchObject({ seq: '0', entry: '3', message: { role: 'user' } })
    expect(typeof row?.bytes).toBe('string')
    expect(row).not.toHaveProperty('sourceCall')
    expect(first.page.next).toEqual({ evidence: ev, after: '0' })
  })

  it('refuses a cursor of another evidence and a malformed upper bound without a Session call', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(2)
    const ev = await resolved(w, parts)
    const before = w.sessionCalls()
    const other: HistoryEvidence = { ...ev, upper: { kind: 'entry', seq: '1' as never } }
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

  describe('a Session page that does not translate is a visible defect', () => {
    const rowZero = (page: Extract<ModelViewRead, { kind: 'page' }>): ModelViewRead => ({
      ...page,
      rows: page.rows.map((row, at) => (at === 0 ? { ...row, seq: '0' } : row)),
    })
    it.each([
      {
        name: 'a row numbered 0',
        page: rowZero,
        diagnostic: 'model view row 0 does not translate',
      },
      {
        name: 'a row that is not a canonical decimal',
        page: (page: Extract<ModelViewRead, { kind: 'page' }>): ModelViewRead => ({
          ...page,
          rows: page.rows.map((row, at) => (at === 0 ? { ...row, seq: '01' } : row)),
        }),
        diagnostic: 'model view row 01 does not translate',
      },
      {
        name: 'a next cursor that follows no row',
        page: (page: Extract<ModelViewRead, { kind: 'page' }>): ModelViewRead => ({
          ...page,
          rows: [],
          next: 'after-nothing',
        }),
        diagnostic: 'the model view cursor follows no row',
      },
    ])('$name', async ({ page, diagnostic }) => {
      const w = await world()
      const { parts } = await w.borrow()
      await w.remind(2)
      const ev = await resolved(w, parts)
      w.faults.page = page
      const answer = await parts.history.read({
        access: w.access,
        evidence: ev,
        cursor: null,
        budgetBytes: 1,
      })
      expect(answer).toMatchObject({
        kind: 'unavailable',
        diagnostic: `translation defect: ${diagnostic}`,
      })
      expect(w.logged).toContainEqual({
        name: 'session-adapters/history-source',
        type: 'error',
        text: `translation defect: ${diagnostic}`,
      })
    })

    it('a page that does not move past the cursor it was asked from is a defect, not thousands of reads', async () => {
      const w = await world()
      const { parts } = await w.borrow()
      await w.remind(6)
      const ev = await resolved(w, parts)
      w.faults.page = page => ({ ...page, rows: page.rows.slice(0, 1), next: '0' })
      const calls = w.sessionCalls()
      const answer = await parts.history.read({
        access: w.access,
        evidence: ev,
        cursor: { evidence: ev, after: '4' as never },
        budgetBytes: 1,
      })
      expect(answer).toMatchObject({
        kind: 'unavailable',
        diagnostic: 'translation defect: the model view page does not move on',
      })
      expect(w.sessionCalls() - calls).toBeLessThanOrEqual(3)
    })

    it('a bound of 0 in the basis is the empty history, not a defect', async () => {
      const w = await world()
      const { parts } = await w.borrow()
      const ev = await resolved(w, parts)
      const answer = await parts.history.read({
        access: w.access,
        evidence: { ...ev, upper: { kind: 'empty' } },
        cursor: null,
        budgetBytes: 1,
      })
      expect(answer.kind).not.toBe('unavailable')
      expect(w.logged.filter(item => item.type === 'error')).toEqual([])
    })
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
      current: { target: ev.target, epoch: `${ev.epoch}+1`, upper: { kind: 'entry', seq: '0' } },
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

  it('numbers the rows of an epoch from 0 to the upper bound, as the Request Context reads them', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(4)
    const ev = await resolved(w, parts)
    if (ev.upper.kind !== 'entry') throw new Error('an entry upper bound is expected')
    let cursor: HistoryCursor | null = null
    let expected = 0n
    for (let pages = 0; ; pages++) {
      if (pages > 20) throw new Error('the read did not end')
      const answer: HistoryReadResult = await parts.history.read({
        access: w.access,
        evidence: ev,
        cursor,
        budgetBytes: 1,
      })
      if (answer.kind !== 'page') throw new Error(`not a page: ${JSON.stringify(answer)}`)
      for (const row of answer.page.rows) {
        expect(row.seq).toBe(String(expected))
        expected += 1n
      }
      if (answer.page.next === null) break
      expect(answer.page.next.after).toBe(answer.page.rows.at(-1)?.seq)
      cursor = answer.page.next
    }
    expect(String(expected - 1n)).toBe(ev.upper.seq)
    expect(ev.upper.seq).toBe('4')
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

  it('reads the provider only for an admitted access, with the access of the call and the session of the target', async () => {
    const w = await world()
    const { parts } = await w.borrow()
    const { target } = await resolved(w, parts)
    expect(parts.adopted.authority).toMatchObject({ owner: '@omne-harness/session-adapters' })
    expect(await parts.adopted.readSource({ access: w.access, target })).toEqual({
      kind: 'value',
      value: null,
    })
    expect(w.provider.state.calls).toEqual([{ access: w.access, session: w.s.access.session }])
    w.qualification.session = false
    expect(await parts.adopted.readSource({ access: w.access, target })).toEqual({ kind: 'denied' })
    expect(await parts.adopted.readCount({ access: w.access, target })).toEqual({ kind: 'denied' })
    expect(w.provider.state.calls).toHaveLength(1)
  })
})

function savedOf(target: ContextTarget, tag: string, order: string, values: FixedValues = {}) {
  const { record, adoptedRequest, adoptedContext } = m0Checkpoint(target, tag, values)
  const saved: SessionAdoptedRequest = {
    order,
    execution: `exe_${tag}`,
    reference: adoptedRequest.reference,
    fixed: adoptedRequest.fixed,
    coverage: adoptedContext,
    schema: adoptedRequest.schema,
    record: adoptedRequest.record,
  }
  return { saved, record }
}

describe('the narrow adoption source reads the a part of the session', () => {
  async function adoptedWorld() {
    const w = await world()
    const { parts } = await w.borrow()
    const { target } = await resolved(w, parts)
    const source = () => parts.adopted.readSource({ access: w.access, target })
    const count = () => parts.adopted.readCount({ access: w.access, target })
    return { w, parts, target, source, count }
  }

  it('answers null before the first M0, and after one every field of the fact from the a part', async () => {
    const { w, target, source } = await adoptedWorld()
    expect(await source()).toEqual({ kind: 'value', value: null })
    const { saved, record } = savedOf(target, '1', '1')
    w.provider.state.saved = saved
    const answer = await source()
    if (answer.kind !== 'value' || answer.value === null) throw new Error(JSON.stringify(answer))
    const expected = {
      coverage: record.coverage,
      target,
      call: { tenant: target.tenant, call: 'mcall_1' },
      candidate: record.candidate,
      order: '1',
      committed: saved.fixed,
      windowTokens: record.windowTokens,
      accounting: { kind: 'unsettled' },
      forecast: record.forecast,
      continuation: null,
    }
    expect(Object.keys(answer.value).sort()).toEqual(Object.keys(expected).sort())
    for (const [field, value] of Object.entries(expected))
      expect(answer.value[field as keyof typeof answer.value], field).toEqual(value)
  })

  it('the token changes when a new M0 is saved, and only then', async () => {
    const { w, target, count, source } = await adoptedWorld()
    const none = await count()
    expect(none.kind).toBe('value')
    expect(await count()).toEqual(none)
    w.provider.state.saved = savedOf(target, '1', '1').saved
    const first = await count()
    expect(first.kind).toBe('value')
    expect(first).not.toEqual(none)
    await source()
    expect(await count()).toEqual(first)
    w.provider.state.saved = savedOf(target, '2', '2').saved
    const second = await count()
    expect(second.kind).toBe('value')
    expect(second).not.toEqual(first)
  })

  it('the order is the order of the a part: one more for the M0 of the next execution', async () => {
    const { w, target, source } = await adoptedWorld()
    const orders: string[] = []
    for (const [tag, order] of [
      ['1', '1'],
      ['2', '2'],
    ] as const) {
      w.provider.state.saved = savedOf(target, tag, order).saved
      const answer = await source()
      if (answer.kind !== 'value' || answer.value === null) throw new Error(JSON.stringify(answer))
      orders.push(answer.value.order)
    }
    expect(orders).toEqual(['1', '2'])
  })

  it('a record of another tenant is denied, a record of another scope is null', async () => {
    const { w, target, source } = await adoptedWorld()
    w.provider.state.saved = savedOf({ ...target, tenant: intruder.tenant }, '1', '1').saved
    expect(await source()).toEqual({ kind: 'denied' })
    const earlier = { ...target, scope: { ...target.scope, ref: 'scope:earlier' } as never }
    w.provider.state.saved = savedOf(earlier, '1', '1').saved
    expect(await source()).toEqual({ kind: 'value', value: null })
  })

  it('a target scope retired while the a part was read is unavailable, not null', async () => {
    const { w, target, source } = await adoptedWorld()
    const bindings = ok(await w.s.backend.transactions.readWork(w.s.access)).contextScopes ?? []
    const last = bindings.at(-1)
    if (last === undefined) throw new Error('the session has no scope')
    const next = { ...target, scope: { ...target.scope, ref: 'scope:after-archive' } as never }
    w.provider.state.saved = savedOf(next, '2', '2').saved
    w.provider.state.meanwhile = () => {
      w.faults.scopes = [
        ...bindings.map(binding => ({ ...binding, ended: evidence('archived') })),
        { ...last, scope: 'scope:after-archive', ended: null },
      ]
    }
    const answer = await source()
    expect(answer).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(answer)).toContain('retired')
  })

  it('a record of another scope is unavailable while the current scope is not readable', async () => {
    const { w, target, source } = await adoptedWorld()
    const earlier = { ...target, scope: { ...target.scope, ref: 'scope:earlier' } as never }
    w.provider.state.saved = savedOf(earlier, '1', '1').saved
    await w.fibers.get('lowerBound')?.dispose()
    expect(await source()).toMatchObject({ kind: 'unavailable' })
  })

  it('passes the provider unavailable and denied on as they are, never as null', async () => {
    const { w, source, count } = await adoptedWorld()
    w.provider.state.answer = { kind: 'unavailable', diagnostic: 'the a part is not readable' }
    expect(await source()).toMatchObject({ kind: 'unavailable' })
    expect(await count()).toMatchObject({ kind: 'unavailable' })
    w.provider.state.answer = { kind: 'denied' }
    expect(await source()).toEqual({ kind: 'denied' })
    w.provider.state.answer = 'throw'
    expect(await source()).toMatchObject({ kind: 'unavailable' })
  })

  it('answers unavailable without sessionAdoptedRequests', async () => {
    const w = await world({ adopted: 'absent' })
    const { parts } = await w.borrow()
    const { target } = await resolved(w, parts)
    const answer = await parts.adopted.readSource({ access: w.access, target })
    expect(answer).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(answer)).toContain('adopted-requests-absent')
  })

  it('a record whose coverage is not the coverage of the M0 evidence, or that does not decode, is invalid', async () => {
    const { w, target, source } = await adoptedWorld()
    const { saved } = savedOf(target, '1', '1')
    const tampered = structuredClone(saved.record) as { coverage: { prefixBreak: string } }
    tampered.coverage.prefixBreak = 'unchanged'
    w.provider.state.saved = { ...saved, record: tampered }
    expect(await source()).toEqual({
      kind: 'invalid',
      field: 'adopted',
      reason: 'source-evidence-conflict',
    })
    w.provider.state.saved = { ...saved, coverage: null }
    expect(await source()).toMatchObject({ kind: 'invalid', reason: 'source-evidence-conflict' })
    w.provider.state.saved = { ...saved, record: { schema: 'other/1' } }
    expect(await source()).toEqual({
      kind: 'invalid',
      field: 'adopted',
      reason: 'unsupported-format',
    })
  })

  it('the coverage evidence that the real agent-context mints for a ready preparation passes the check', async () => {
    const w = await world()
    const { ready, target: fixed } = await agentContextReady(w.s.access.tenant)
    const bindings = ok(await w.s.backend.transactions.readWork(w.s.access)).contextScopes ?? []
    const last = bindings.at(-1)
    if (last === undefined) throw new Error('the session has no scope')
    w.faults.scopes = [...bindings.slice(0, -1), { ...last, scope: fixed.scope.ref }]
    const { parts } = await w.borrow()
    const { target } = await resolved(w, parts)
    expect(target.scope.ref).toBe(fixed.scope.ref)
    w.provider.state.saved = {
      order: '1',
      execution: 'exe_1',
      reference: invocation(w.s.access.tenant, 'ready'),
      fixed: ready.source,
      coverage: ready.coverage,
      schema: ready.schema,
      record: ready.state,
    }
    const answer = await parts.adopted.readSource({ access: w.access, target })
    expect(answer).toMatchObject({
      kind: 'value',
      value: { order: '1', committed: ready.source, candidate: 'action-1' },
    })
  })

  it('the window usage of the real accounting is not-fixed before the first M0 and an estimate after it', async () => {
    const { w, parts, target } = await adoptedWorld()
    const accounting = createContextAccounting<unknown>({
      sourceAuthority: { check: async () => ({ kind: 'allowed' }) },
      readEligibility: parts.eligibility,
      adoptedSource: parts.adopted,
      recoveryAuthority: {
        check: async () => ({ kind: 'allowed' }),
        checkFact: async () => ({ kind: 'allowed' }),
      },
      limits: { maxTargets: 4, maxFactsPerTarget: 16, maxRevisionsPerDispatch: 8 },
    })
    const grant = decodeRecoveryGrantRef('grant_1')
    if ('failure' in grant) throw new Error('the fixture grant is invalid')
    const rebuilt = await accounting.recovery.rebuildAccounts({
      access: { scope: 'system', principal: 'host', grant: grant.ok },
      target,
      replay: {
        snapshot: evidence('accounts'),
        facts: (async function* (): AsyncGenerator<never> {})(),
      },
    })
    expect(rebuilt.kind).toBe('rebuilt')
    const usage = () => accounting.inbox.usage({ access: w.access, target })
    expect(await usage()).toEqual({ kind: 'value', value: { kind: 'not-fixed' } })
    const { saved, record } = savedOf(target, '1', '1', {
      windowTokens: '128000',
      forecast: { kind: 'estimate', usedTokens: '1200' },
    })
    w.provider.state.saved = saved
    expect(await usage()).toMatchObject({
      kind: 'value',
      value: {
        kind: 'estimate',
        candidate: record.candidate,
        usedTokens: '1200',
        windowTokens: '128000',
      },
    })
  })
})

const CALLS_PER_TAIL_READ = 2

describe('a page after the cursor costs the same at N = 10 and N = 100 rows', () => {
  type Tail = Readonly<{ calls: number; rows: number; returned: readonly string[] }>
  type TailRead = (
    parts: ContextHolderParts<unknown>,
    w: Awaited<ReturnType<typeof world>>,
    ev: HistoryEvidence,
    after: string,
  ) => Promise<readonly string[]>

  const afterCursor: TailRead = async (parts, w, ev, after) => {
    const answer = await parts.history.read({
      access: w.access,
      evidence: ev,
      cursor: { evidence: ev, after: after as never },
      budgetBytes: 400,
    })
    if (answer.kind !== 'page') throw new Error(JSON.stringify(answer))
    return answer.page.rows.map(row => row.seq)
  }

  async function tail(rows: number, read: TailRead = afterCursor): Promise<Tail> {
    const w = await world()
    const { parts } = await w.borrow()
    await w.remind(rows - 3)
    expect(await readAll(parts, w.access, await resolved(w, parts))).toHaveLength(rows - 2)
    await w.remind(2, 'later')
    const ev = await resolved(w, parts)
    const calls = w.sessionCalls()
    const served = w.modelViewRows.length
    const returned = await read(parts, w, ev, String(rows - 3))
    return {
      calls: w.sessionCalls() - calls,
      rows: w.modelViewRows.slice(served).reduce((sum, count) => sum + count, 0),
      returned,
    }
  }

  function expectFlat(small: Tail, large: Tail) {
    expect(small.calls).toBe(CALLS_PER_TAIL_READ)
    expect(large.calls).toBe(CALLS_PER_TAIL_READ)
    expect(small.rows).toBe(large.rows)
  }

  it('reads the rows after the cursor and one row before it, then the cursor for the next read', async () => {
    const small = await tail(10)
    const large = await tail(100)
    expectFlat(small, large)
    expect(small.returned).toEqual(['8', '9'])
    expect(large.returned).toEqual(['98', '99'])
  })

  it('negative control: a reader that reads the history from the start fails the same assertions', async () => {
    const fromStart: TailRead = async (parts, w, ev, after) => {
      const seqs = await readAll(parts, w.access, ev)
      return seqs.filter(seq => Number(seq) > Number(after))
    }
    const small = await tail(10, fromStart)
    const large = await tail(100, fromStart)
    expect(large.calls).toBeGreaterThan(small.calls)
    expect(() => expectFlat(small, large)).toThrow()
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
