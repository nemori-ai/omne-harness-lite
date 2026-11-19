import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelOperationId,
  type DispatchRecord,
  type ModelCallId,
} from '@omne-harness/model-contract'
import type { CostLookupAnswer, ModelCommands } from '@omne-harness/model-contract/provider'
import { createCostLookups, lookupSource } from '../src/plugins/cost-lookups.ts'
import { reportRuntimeEvent, type RuntimeEvent } from '../src/plugins/runtime.ts'

const ACCESS = { principal: 'host', tenant: 'tenant' as unknown as TenantId }
const CALL = 'mcall_one' as ModelCallId
const op = (() => {
  let n = 0
  return () => {
    const decoded = decodeModelOperationId(`mop_lookup-${++n}`)
    if ('failure' in decoded) throw new Error('fixture operation')
    return decoded.ok
  }
})()

function dispatch(over: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    dispatch: 'mdisp_one',
    send: 'started',
    terminal: {
      kind: 'failed',
      fault: { cause: 'stream-lost', diagnostic: 'd', upstreamStatus: null },
    },
    account: null,
    request: 'gen-1',
    ...over,
  } as DispatchRecord
}

/** The step over one dispatch record, a scripted answer and a late-fact entry that answers as told. */
function stepping(
  record: DispatchRecord,
  answer: CostLookupAnswer,
  refuse = false,
  given: Readonly<{ records?: 'unavailable'; lookup?: 'absent' }> = {},
) {
  const facts: Parameters<ModelCommands<unknown>['recordLateFact']>[0][] = []
  const asked: unknown[] = []
  const reports: RuntimeEvent[] = []
  const lookups = createCostLookups({
    commands: {
      dispatches: input => {
        asked.push({ records: input })
        return Promise.resolve(
          given.records === 'unavailable'
            ? { failure: { kind: 'unavailable', dependency: 'model-records', diagnostic: 'd' } }
            : { ok: [record] },
        ) as never
      },
    },
    lookup:
      given.lookup === 'absent'
        ? undefined
        : input => {
            asked.push(input)
            return Promise.resolve(answer)
          },
    limits: { maxCostMisses: 3 },
    report: event => reports.push(event),
    operation: op,
  })
  const recordLateFact: ModelCommands<unknown>['recordLateFact'] = input => {
    facts.push(input)
    return Promise.resolve(
      refuse
        ? { failure: { kind: 'unavailable', dependency: 'model-records', diagnostic: 'd' } }
        : { ok: { revision: '9', recovered: false } },
    ) as never
  }
  const step = (stopping = new AbortController().signal) =>
    lookups.step(CALL, ACCESS, recordLateFact, stopping)
  return { step, facts, asked, reports }
}

const FOUND: CostLookupAnswer = {
  kind: 'found',
  cost: [{ state: 'known', lexeme: '0.0000916', unit: 'openrouter-credit', source: 'billable' }],
  place: 'openrouter/OpenAI',
}

describe('the cost lookups of a settled call', () => {
  it('records a found cost as the next revision of the account, from the request id, and owes nothing more', async () => {
    const s = stepping(dispatch(), FOUND)
    expect(await s.step()).toBe(false)
    expect(s.asked).toEqual([
      { records: { ...ACCESS, call: CALL } },
      { ...ACCESS, call: CALL, dispatch: 'mdisp_one' },
    ])
    expect(s.facts).toMatchObject([
      { call: CALL, dispatch: 'mdisp_one', source: lookupSource('gen-1') },
    ])
    expect(s.facts[0]?.fact).toEqual({
      kind: 'account',
      event: 'cost-lookup',
      value: {
        usage: [],
        cost: FOUND.kind === 'found' ? FOUND.cost : [],
        trimmed: { state: 'unknown', unit: 'token' },
        place: 'openrouter/OpenAI',
        duration: { state: 'unknown' },
        revision: '1',
      },
    })
    expect(lookupSource('gen-1')).toEqual({
      owner: 'model-cost-lookup',
      record: 'gen-1',
      revision: '1',
      digest: createHash('sha256').update('gen-1').digest('hex'),
    })
    const later = stepping(
      dispatch({
        account: { usage: [], cost: [], revision: '4' } as unknown as DispatchRecord['account'],
      }),
      FOUND,
    )
    await later.step()
    expect(later.facts[0]?.fact).toMatchObject({ value: { revision: '5' } })
  })

  it('counts a miss and owes another wake, and the miss that reaches the bound gives up', async () => {
    const first = stepping(dispatch(), { kind: 'missed' })
    expect(await first.step()).toBe(true)
    expect(first.facts[0]?.fact).toEqual({ kind: 'cost-miss', event: 'miss-1', final: false })
    const last = stepping(dispatch({ lookup: { misses: 2, exhausted: false } }), { kind: 'missed' })
    expect(await last.step()).toBe(false)
    expect(last.facts[0]?.fact).toEqual({ kind: 'cost-miss', event: 'miss-3', final: true })
  })

  it('gives up at once on a route that cannot look a cost up', async () => {
    const s = stepping(dispatch(), { kind: 'unsupported' })
    expect(await s.step()).toBe(false)
    expect(s.facts[0]?.fact).toEqual({ kind: 'cost-miss', event: 'miss-1', final: true })
  })

  it('records nothing for an unavailable answer, which does not count, and owes another wake', async () => {
    const s = stepping(dispatch(), { kind: 'unavailable', diagnostic: 'status-502' })
    expect(await s.step()).toBe(true)
    expect(s.facts).toEqual([])
    expect(s.reports).toEqual([{ kind: 'cost-lookup-pending', reason: 'unavailable status-502' }])
  })

  it('owes another wake when the found cost could not be recorded', async () => {
    const s = stepping(dispatch(), FOUND, true)
    expect(await s.step()).toBe(true)
    expect(s.reports).toEqual([{ kind: 'cost-lookup-pending', reason: 'unrecorded unavailable' }])
  })

  it('asks nothing for a dispatch whose lookup is not pending', async () => {
    for (const record of [
      (({ request: _request, ...rest }) => rest as DispatchRecord)(dispatch()),
      dispatch({ terminal: null }),
      dispatch({ lookup: { misses: 3, exhausted: true } }),
    ]) {
      const s = stepping(record, FOUND)
      expect(await s.step()).toBe(false)
      expect(s.asked).toEqual([{ records: { ...ACCESS, call: CALL } }])
    }
  })

  it('owes another wake when the records cannot be read or the wake is stopping, and nothing without a lookup', async () => {
    expect(await stepping(dispatch(), FOUND, false, { records: 'unavailable' }).step()).toBe(true)
    const stopped = new AbortController()
    stopped.abort()
    const s = stepping(dispatch(), FOUND)
    expect(await s.step(stopped.signal)).toBe(true)
    expect(s.facts).toEqual([])
    const none = stepping(dispatch(), FOUND, false, { lookup: 'absent' })
    expect(await none.step()).toBe(false)
    expect(none.asked).toEqual([])
  })
})

describe('the runtime events of the cost lookups and the late accounts', () => {
  it('logs a pending lookup and an unconfirmed late account as warnings with their reason', () => {
    const warned: string[] = []
    const ctx = { logger: { warn: (text: string) => warned.push(text), info: () => {} } }
    reportRuntimeEvent(ctx as never, { kind: 'cost-lookup-pending', reason: 'unavailable x' })
    reportRuntimeEvent(ctx as never, { kind: 'late-account-unconfirmed', failure: 'denied' })
    expect(warned).toEqual([
      'model result push: a cost lookup stays pending (unavailable x)',
      'model result push: a delivered late account is not confirmed (denied)',
    ])
  })
})
