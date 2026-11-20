import { describe, expect, it } from 'vitest'
import type { CallAccount } from '@omne-harness/call-account'
import type { ModelDispatchFact } from '@omne-harness/model-contract'
import type { ToolUsageFact } from '@omne-harness/tool-contract/provider'
import {
  modelUsageFact,
  modelUsageSource,
  msBetween,
  msOfDuration,
  toolUsageFact,
  toolUsageSource,
} from '@omne-harness/usage-adapters'

const consumer = { owner: 'agent', work: 'exec-1/step-1', position: 'I3', purpose: 'main' }
const account = (changes: Partial<CallAccount> = {}): CallAccount => ({
  subject: { kind: 'model_call', id: 'mc-1' },
  usage: [{ name: 'input', state: 'known', lexeme: '400', unit: 'token' }],
  cost: [{ source: 'billable', state: 'known', lexeme: '0.001368', unit: 'openrouter-credit' }],
  trimmed: { state: 'known', lexeme: '0', unit: 'bytes' },
  place: 'model',
  duration: 'PT2.436S',
  receipt: 'received',
  revision: '1',
  ...changes,
})
const dispatch = (changes: Partial<ModelDispatchFact> = {}): ModelDispatchFact =>
  ({
    call: 'mc-1',
    dispatch: 'md-1',
    consumer,
    profile: { owner: 'model', name: 'default', revision: '1', digest: 'd' },
    supplier: { adoption: {}, provider: 'openrouter', model: 'openai/gpt-6.1-sol', credential: {} },
    contextWindow: { tokens: '200000', compactionTriggerPercent: '80' },
    instants: {
      prepared: '2026-11-19T14:01:06.297Z',
      sent: '2026-11-19T14:01:06.374Z',
      responseStarted: '2026-11-19T14:01:07.452Z',
      firstContent: '2026-11-19T14:01:08.343Z',
      ended: '2026-11-19T14:01:08.810Z',
    },
    send: 'sent',
    outcome: { kind: 'completed', reason: 'stop' },
    connectRetries: 1,
    account: account(),
    costLookup: { kind: 'not-needed' },
    ...changes,
  }) as never
const execution = (changes: Partial<ToolUsageFact> = {}): ToolUsageFact =>
  ({
    call: 'tc-1',
    consumer: { ...consumer, work: 'exec-1', purpose: 'action' },
    tool: 'Shell',
    start: '2026-11-19T14:02:00.000Z',
    outcome: { kind: 'completed' },
    account: account({
      subject: { kind: 'tool_execution', id: 'tc-1' },
      usage: [],
      cost: [],
      duration: 'PT2.5S',
    }),
    ...changes,
  }) as never

describe('a model dispatch as a usage fact', () => {
  it('carries the call, the dispatch, the labels, the payable cost and the durations of its instants', () => {
    expect(modelUsageFact(dispatch())).toEqual({
      source: 'model',
      subject: { kind: 'model_call', id: 'mc-1' },
      unit: 'md-1',
      at: '2026-11-19T14:01:06.297Z',
      consumer,
      labels: {
        model: 'openai/gpt-6.1-sol',
        provider: 'openrouter',
        profile: 'default',
        tool: null,
      },
      outcome: 'completed',
      cause: null,
      usage: [{ name: 'input', state: 'known', lexeme: '400', unit: 'token' }],
      cost: { state: 'known', lexeme: '0.001368', unit: 'openrouter-credit' },
      durations: { toResponse: 1078, toFirstContent: 1969, total: 2436, generation: 467 },
      connectRetries: 1,
      window: { tokens: '200000', compactAtPercent: '80' },
      accounted: true,
    })
  })

  it('marks usage and cost unknown for a sent dispatch with no account, and absent for one never sent', () => {
    const sent = modelUsageFact(dispatch({ account: null, outcome: { kind: 'pending' } }))
    expect(sent.usage).toEqual([
      { name: 'input', state: 'unknown', unit: 'token' },
      { name: 'output', state: 'unknown', unit: 'token' },
    ])
    expect(sent.cost).toEqual({ state: 'unknown' })
    expect(sent.accounted).toBe(false)
    expect(sent.outcome).toBe('pending')
    const unsent = modelUsageFact(dispatch({ account: null, send: 'not-sent' }))
    expect([unsent.usage, unsent.cost]).toEqual([[], null])
    const unknownSend = modelUsageFact(dispatch({ account: null, send: 'unknown' }))
    expect(unknownSend.cost).toEqual({ state: 'unknown' })
  })

  it('takes the cause of a failure, no cost for an account without cost items, unknown for an unpayable one', () => {
    const failed = modelUsageFact(
      dispatch({
        outcome: { kind: 'failed', cause: 'runtime-lost', upstreamStatus: null } as never,
      }),
    )
    expect([failed.outcome, failed.cause]).toEqual(['failed', 'runtime-lost'])
    expect(modelUsageFact(dispatch({ account: account({ cost: [] }) })).cost).toBeNull()
    const estimate = account({
      cost: [{ source: 'supplier', state: 'known', lexeme: '1', unit: 'USD' }],
    })
    expect(modelUsageFact(dispatch({ account: estimate })).cost).toEqual({ state: 'unknown' })
    expect(modelUsageFact(dispatch({ contextWindow: null })).window).toBeNull()
    const unjudged = account({ revision: 'two' })
    expect(modelUsageFact(dispatch({ account: unjudged })).cost).toEqual({ state: 'unknown' })
  })

  it('leaves a duration unknown when one instant is missing or they are out of order', () => {
    const instants = {
      ...dispatch().instants,
      firstContent: null,
      ended: '2026-11-19T14:01:06.000Z',
    }
    expect(modelUsageFact(dispatch({ instants })).durations).toEqual({
      toResponse: 1078,
      toFirstContent: null,
      total: null,
      generation: null,
    })
    expect(msBetween('2026-11-19T00:00:00.000Z', 'later')).toBeNull()
    expect(msBetween('2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z')).toBe(0)
  })
})

describe('a tool call as a usage fact', () => {
  it('carries the call, the tool and the duration of its account, with nothing payable', () => {
    expect(toolUsageFact(execution())).toEqual({
      source: 'tool',
      subject: { kind: 'tool_execution', id: 'tc-1' },
      unit: 'tc-1',
      at: '2026-11-19T14:02:00.000Z',
      consumer: { ...consumer, work: 'exec-1', purpose: 'action' },
      labels: { model: null, provider: null, profile: null, tool: 'Shell' },
      outcome: 'completed',
      cause: null,
      usage: [],
      cost: null,
      durations: { toResponse: null, toFirstContent: null, total: 2500, generation: null },
      connectRetries: 0,
      window: null,
      accounted: true,
    })
  })

  it('reads every ending as completed, failed or interrupted with a cause', () => {
    const ending = (outcome: unknown) => {
      const fact = toolUsageFact(execution({ outcome: outcome as never }))
      return [fact.outcome, fact.cause]
    }
    expect(ending({ kind: 'failed', cause: 'executor' })).toEqual(['failed', 'executor'])
    expect(ending({ kind: 'interrupted', cause: { kind: 'control' } })).toEqual([
      'interrupted',
      'control',
    ])
    expect(ending({ kind: 'unavailable' })).toEqual(['failed', 'unavailable'])
    expect(ending({ kind: 'no-response' })).toEqual(['failed', 'no-response'])
  })

  it('reads an account duration of SI seconds and nothing else', () => {
    expect(['PT0S', 'PT1.5S', 'PT2.025S', 'PT10S'].map(text => msOfDuration(text))).toEqual([
      0, 1500, 2025, 10000,
    ])
    for (const other of [
      'PT1M',
      'P1D',
      'PT1.2345S',
      '2.5',
      'xPT1S',
      'PT1Sx',
      { state: 'unknown' as const },
    ])
      expect(msOfDuration(other), JSON.stringify(other)).toBeNull()
  })
})

describe('the two sources over the producer reads', () => {
  const request = {
    principal: {},
    tenant: {} as never,
    range: { from: '2026-11-19T00:00:00.000Z', to: '2026-11-20T00:00:00.000Z' },
    consumer: null,
    after: null,
    limit: 5,
  }

  it('asks the read for its range in ascending order and maps each entry', async () => {
    const asked: unknown[] = []
    const model = modelUsageSource(
      () =>
        ({
          list: (input: unknown) => (
            asked.push(input),
            Promise.resolve({ ok: { entries: [dispatch()], undated: 2, next: 'n' } })
          ),
        }) as never,
      { page: 200, works: 100 },
    )
    expect(model.name).toBe('model')
    expect(await model.list(request)).toMatchObject({
      ok: { undated: 2, next: 'n', entries: [{ unit: 'md-1' }] },
    })
    expect(asked).toEqual([{ ...request, order: 'ascending' }])
    const toolAsked: unknown[] = []
    const tool = toolUsageSource(
      () =>
        ({
          list: (input: unknown) => (
            toolAsked.push(input),
            Promise.resolve({ ok: { entries: [execution()], undated: 0, next: null } })
          ),
        }) as never,
      { page: 500, works: 64 },
    )
    expect([tool.name, tool.limits]).toEqual(['tool', { page: 500, works: 64 }])
    expect(await tool.list(request)).toMatchObject({ ok: { entries: [{ unit: 'tc-1' }] } })
    expect(toolAsked).toEqual([{ ...request, order: 'ascending' }])
  })

  it('answers denied as the read does, and unavailable when it fails otherwise, throws or is not here', async () => {
    const over = (read: unknown) =>
      modelUsageSource(() => read as never, { page: 1, works: 1 }).list(request)
    expect(
      await over({
        list: () => Promise.resolve({ failure: { kind: 'denied', action: 'account' } }),
      }),
    ).toEqual({
      failure: { kind: 'denied' },
    })
    expect(
      await over({ list: () => Promise.resolve({ failure: { kind: 'unavailable' } }) }),
    ).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the producer answered unavailable' },
    })
    expect(await over({ list: () => Promise.reject(new Error('down')) })).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the producer read threw' },
    })
    expect(await over(undefined)).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the model dispatch facts read is not here' },
    })
    expect(await toolUsageSource(() => undefined, { page: 1, works: 1 }).list(request)).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the tool accounts read is not here' },
    })
  })
})
