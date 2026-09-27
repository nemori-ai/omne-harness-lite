import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type {
  CachedRead,
  ClientLocalState,
  LocalRecord,
} from '@omne-harness-lite/client-local-state'
import type { ActionReport, ActionInput } from '../src/surface.ts'
import { Client } from '../src/client.ts'
import { CacheKnowledge, cacheContext } from '../src/cache.ts'
import { READ_OPERATIONS, AI16, AI37, AI50, OG36, ENTRY50, og } from '../src/routes.ts'
import { exitStatus } from '../src/report.ts'
import {
  actor,
  center,
  fixtures,
  logged,
  ok,
  open,
  read,
  rejected,
  replace,
  unavailable,
} from './support.ts'

const examples: { definition: string; valid: boolean; value: unknown }[] = JSON.parse(
  readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/compositions/governance-client-operations/v1/examples.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
const outputs = examples
  .filter(e => e.valid && e.definition === 'Output')
  .map(e => e.value as ActionReport)
const inputs = examples
  .filter(e => e.valid && e.definition === 'Input')
  .map(e => e.value as ActionInput)
const seeds: CachedRead[] = [...READ_OPERATIONS].map(operation => {
  const input = inputs.find(i => i.action === 'invoke' && i.operation === operation)
  if (input?.action !== 'invoke') throw new Error('missing read fixture')
  const reply = outputs.find(o => o.operation === operation && o.remote.status === 'success')
    ?.remote.reply?.reply
  if (reply === undefined || !('result' in reply)) throw new Error('missing read result fixture')
  const context = cacheContext(operation, input.payload, actor.account)
  return {
    centerId: center.centerId,
    accountId: actor.account,
    operation,
    payload: input.payload,
    result: reply.result,
    acquiredAt: '2026-09-24T00:00:00Z',
    ...(context === undefined ? {} : { tenant: context }),
  }
})
const withCache: LocalRecord = { ...logged, cache: seeds }
const action = (copy: CachedRead, readMode: 'refresh' | 'prefer-copy' = 'prefer-copy') => ({
  action: 'invoke',
  operation: copy.operation,
  payload: copy.payload,
  readMode,
})
const seed = (operation: string) => seeds.find(c => c.operation === operation)!

describe('13 precise read copies and conservative invalidation', () => {
  const f = fixtures()
  it('credential rejection never reads or retains the write payload as a cache query', () => {
    const knowledge = new CacheKnowledge()
    const payload = {
      get currentCredential(): never {
        throw new Error('credential must not enter cache knowledge')
      },
      get newCredential(): never {
        throw new Error('credential must not enter cache knowledge')
      },
    }
    knowledge.observe(
      withCache,
      AI50,
      payload,
      { failure: 'current-credential-rejected' },
      actor.account,
    )
    expect(knowledge.prepare(withCache, []).cache).toEqual(seeds)
    knowledge.observe(
      withCache,
      og(37),
      { expectedTenant: actor, targetTenant: actor },
      { failure: 'expectedTenantMismatch' },
      actor.account,
    )
    expect(knowledge.prepare(withCache, []).cache.some(c => c.operation === OG36)).toBe(false)
    knowledge.clear()
    expect(knowledge.prepare(withCache, []).cache).toEqual(seeds)
  })

  it.each(seeds.map(copy => [copy.operation, copy] as const))(
    'prefer-copy %s performs no health or governance request',
    async (_, copy) => {
      const { client, health, exchange, state } = await f(withCache)
      const before = await read(state)
      const result = await client.runAction(action(copy))
      expect(result).toMatchObject({
        remote: { status: 'not-attempted', sendAttempted: false },
        view: {
          source: 'copy',
          acquiredAt: copy.acquiredAt,
          query: { operation: copy.operation, payload: copy.payload },
        },
        local: { status: 'not-requested' },
      })
      expect(result.view.data?.reply).toEqual({ result: copy.result })
      expect(exitStatus(result)).toBe(0)
      expect(health).not.toHaveBeenCalled()
      expect(exchange).not.toHaveBeenCalled()
      expect((await read(state)).revision).toBe(before.revision)
    },
  )
  it.each([
    'connection',
    'trust',
    'timeout',
    'cancelled',
    'response-framing',
    'response-limit',
    'response-invalid',
  ] as const)('refresh fallback is selective for %s', async reason => {
    const { client, exchange } = await f(withCache)
    exchange.mockResolvedValue({ kind: 'unavailable', reason, sendAttempted: true })
    const result = await client.runAction(action(seed(og(27)), 'refresh'))
    expect(result.view.source).toBe(reason === 'trust' || reason === 'cancelled' ? 'none' : 'copy')
    expect(result.remote).toMatchObject({ status: 'unavailable', transportFailure: reason })
    expect(exchange).toHaveBeenCalledTimes(1)
  })
  it('query object order is irrelevant but absent/default and array order are not rewritten', async () => {
    const copy = seed(og(59)),
      { client, exchange } = await f(withCache)
    const result = await client.runAction(
      action({ ...copy, payload: Object.fromEntries(Object.entries(copy.payload).reverse()) }),
    )
    expect(result.view.source).toBe('copy')
    exchange.mockResolvedValue(ok([]))
    const changed = await client.runAction(
      action({ ...copy, payload: { ...copy.payload, includeIneffective: false } }),
    )
    expect(changed.view.source).toBe('online')
    expect(exchange).toHaveBeenCalledTimes(1)
  })
  it('actual EC2 notAuthorized disables related copies even after repeated failed cleanup CAS', async () => {
    const { runtime, state } = await f(withCache)
    const requested = seed(og(22)),
      org = requested.payload['organization'] as string
    const network: string[] = []
    const client = new Client({
      ...runtime,
      state: {
        read: () => state.read(),
        compareAndReplace: async () => ({ kind: 'not-installed', reason: 'unavailable' }),
      },
      exchange: async (_, input) => {
        const operation = (input as { operation: string }).operation
        network.push(operation)
        return operation === og(22) ? rejected('notAuthorized') : unavailable()
      },
    })
    try {
      const use = await open(client)
      expect((await use.run(action(requested, 'refresh'))).remote.status).toBe('rejected')
      const related = seeds.filter(c => c.tenant?.organization === org)
      expect(related.length).toBeGreaterThan(1)
      for (const copy of related) expect((await use.run(action(copy))).view.source).toBe('none')
      expect((await use.run(action(seed(og(27))))).view.source).toBe('copy')
      expect((await read(state)).value?.cache).toEqual(seeds)
    } finally {
      await client.close()
    }
  })
  it('fresh success whose CAS fails cannot revive the old same-key copy; installed exact entries can', async () => {
    const copy = seed(og(26)),
      { runtime, state } = await f(withCache)
    let writable = false,
      response = rejected('notAuthorized')
    const wrapped: ClientLocalState = {
      read: () => state.read(),
      compareAndReplace: (...args) =>
        writable
          ? state.compareAndReplace(...args)
          : Promise.resolve({ kind: 'not-installed', reason: 'unavailable' }),
    }
    const client = new Client({ ...runtime, state: wrapped, exchange: async () => response })
    try {
      const use = await open(client)
      await use.run(action(copy, 'refresh'))
      response = ok({ standing: 'effective', role: 'superAdministrator' })
      expect((await use.run(action(copy, 'refresh'))).view.source).toBe('online')
      response = unavailable()
      expect((await use.run(action(copy))).view.source).toBe('none')
      writable = true
      response = ok({ standing: 'effective', role: 'superAdministrator' })
      expect((await use.run(action(copy, 'refresh'))).local.status).toBe('installed')
      response = unavailable()
      expect((await use.run(action(copy))).view.source).toBe('copy')
      // Another process reinstates an older same-key value; its bytes are not the installed exception.
      await replace(state, withCache)
      expect((await use.run(action(copy))).view.source).toBe('none')
    } finally {
      await client.close()
    }
  })
  it('loss of admin observed before an invalid timestamp still disables old admin copies', async () => {
    const base = seed(og(26)),
      queried = {
        organization: (base.payload['tenant'] as typeof actor).organization,
        account: actor.account,
      }
    const readOwn = { ...base, payload: { tenant: queried } }
    const cache = [...seeds.filter(c => c.operation !== og(26)), readOwn]
    const { runtime } = await f({ ...logged, cache })
    const client = new Client({
      ...runtime,
      observedAt: () => 'not-an-instant',
      exchange: async (_, input) =>
        (input as { operation: string }).operation === og(26)
          ? ok({ standing: 'effective', role: 'member' })
          : unavailable(),
    })
    try {
      const use = await open(client)
      const observed = await use.run(action(readOwn, 'refresh'))
      expect(observed).toMatchObject({
        remote: { status: 'success' },
        local: { status: 'not-installed', reason: 'unavailable' },
        view: { source: 'online' },
      })
      expect((await use.run(action(seed(og(60))))).view.source).toBe('none')
      expect((await use.run(action(seed(og(27))))).view.source).toBe('copy')
    } finally {
      await client.close()
    }
  })
  it('another account being ineffective does not declare this account ineligible', async () => {
    const { client, exchange } = await f(withCache)
    exchange.mockResolvedValue(ok({ standing: 'ineffective' }))
    const use = await open(client)
    const result = await use.run({
      action: 'invoke',
      operation: og(26),
      payload: { tenant: { organization: 'org_kf22', account: 'another-account' } },
      readMode: 'refresh',
    })
    expect(result.remote.status).toBe('success')
    expect((await use.run(action(seed(og(60))))).view.source).toBe('copy')
  })
  it.each([
    [og(21), [og(27)]],
    [og(23), [og(55), og(57), og(58)]],
    [og(24), [og(55), og(57), og(58)]],
    [og(25), [og(55), og(57), og(58), og(26), og(27), og(59)]],
    [og(61), [og(55), og(57), og(58)]],
    [ENTRY50, [og(55), og(57), og(58)]],
    [og(28), [og(26), og(27), og(59)]],
    [og(29), [og(26), og(27), og(59)]],
    [og(30), [og(34), og(56), og(58), og(60)]],
    [og(31), [og(34), og(56), og(58), og(60)]],
    [og(32), [og(34), og(56), og(58), og(60), og(22)]],
    [og(33), [og(34), og(56), og(58), og(60), og(22)]],
    [og(62), [og(34), og(56), og(58), og(60)]],
    [og(37), [OG36]],
    [AI16, [AI37]],
  ] as const)(
    '%s invalidates its full specified groups and preserves unrelated copies',
    (operation, removed) => {
      const knowledge = new CacheKnowledge()
      knowledge.observe(withCache, operation, {}, { result: 'validated upstream' }, actor.account)
      const remaining = knowledge.prepare(withCache, []).cache.map(c => c.operation)
      expect(remaining.sort()).toEqual(
        [...READ_OPERATIONS].filter(o => !(removed as readonly string[]).includes(o)).sort(),
      )
    },
  )
  it('two-organization denial disables both dependencies, with no invented membership result', () => {
    const knowledge = new CacheKnowledge()
    const two = [
      seed(og(22)),
      {
        ...seed(og(22)),
        payload: { organization: 'org-other' },
        tenant: { organization: 'org-other', account: actor.account },
      },
    ]
    const record = { ...logged, cache: [...two, seed(og(27))] }
    knowledge.observe(
      record,
      og(34),
      { organizations: ['org_kf22', 'org-other'] },
      { failure: 'notAuthorized' },
      actor.account,
    )
    expect(knowledge.prepare(record, []).cache.map(c => c.operation)).toEqual([og(27)])
  })
})
