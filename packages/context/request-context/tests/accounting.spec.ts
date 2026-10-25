// The account projection (RQ-14) and its recovery (RQ-15).
import { describe, expect, it } from 'vitest'
import { createContextAccounting } from '@omne-harness/request-context'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { decodeDispatchId, decodeModelCallId } from '@omne-harness/model-contract'
import type { CallAccount } from '@omne-harness/call-account'
import {
  decodeCandidateRef,
  decodeCommitOrder,
  decodeRecoveryGrantRef,
  type AccountingLimits,
  type AdoptedRequestFact,
  type ContextAccountingInput,
  type ContextTarget,
  type SourceDecision,
  type SystemRecoveryAccess,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createMemoryAdoptedSource,
  createMemoryReadEligibility,
} from '@omne-harness/request-context-contract/testing'

function must<T>(v: { ok: T } | { failure: unknown }): T {
  if ('failure' in v) throw new Error('Fixture rejected')
  return v.ok
}
function tenantOf(account = '0'): TenantId {
  const parsed = tenantCodec.parse(
    `{"organization":"org_00000000000000000000000000","account":"acc_${account.padStart(26, '0')}"}`,
  )
  if (!parsed.ok) throw new Error('Tenant fixture')
  return parsed.value
}
const evidence = { owner: 'test', record: 'r', revision: '1', digest: 'd' }
const sender = { owner: 'model', name: 'receiver', revision: '1', digest: 'd' }
const base = createAssemblyFixture()
const target: ContextTarget = base.target
const tenant = target.tenant
const access = base.call.access
const call = must(decodeModelCallId('mcall_one'))
const dispatch = must(decodeDispatchId('mdisp_one'))
const system: SystemRecoveryAccess<string> = {
  scope: 'system',
  principal: 'host',
  grant: must(decodeRecoveryGrantRef('grant_1')),
}
const limits: AccountingLimits = { maxTargets: 4, maxFactsPerTarget: 8, maxRevisionsPerDispatch: 4 }

function account(revision: string, input = '700', id: string = call): CallAccount {
  return {
    subject: { kind: 'model_call', id },
    usage: [
      { name: 'input', state: 'known', lexeme: input, unit: 'token' },
      { name: 'cache-read', state: 'known', lexeme: '0', unit: 'token' },
      { name: 'cache-write', state: 'known', lexeme: '0', unit: 'token' },
    ],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'provider-a',
    duration: { state: 'unknown' },
    receipt: 'received',
    revision,
  }
}
function fact(
  revision = '0',
  input = '700',
  extra: Partial<ContextAccountingInput> = {},
): ContextAccountingInput {
  return {
    kind: 'account',
    origin: { producer: 'model', sender, resultVersion: null },
    target,
    call: { tenant, call },
    dispatch,
    account: account(revision, input),
    committed: evidence,
    ...extra,
  }
}
function adopted(extra: Partial<AdoptedRequestFact> = {}): AdoptedRequestFact {
  return {
    coverage: null as never,
    target,
    call: { tenant, call },
    candidate: must(decodeCandidateRef('candidate:1')),
    order: must(decodeCommitOrder('1')),
    committed: evidence,
    windowTokens: '1000',
    accounting: { kind: 'unique', dispatch },
    forecast: null,
    continuation: null,
    ...extra,
  }
}
async function* replayOf(...facts: ContextAccountingInput[]) {
  for (const item of facts) yield item
}
function setup(
  options: {
    source?: () => SourceDecision
    recovery?: () => SourceDecision
    checkFact?: (input: ContextAccountingInput) => SourceDecision
    limits?: AccountingLimits
  } = {},
) {
  const adoptedSource = createMemoryAdoptedSource<string>()
  const eligibility = createMemoryReadEligibility<string>()
  const accounting = createContextAccounting<string>({
    sourceAuthority: { check: async () => options.source?.() ?? { kind: 'allowed' } },
    readEligibility: eligibility,
    adoptedSource,
    recoveryAuthority: {
      check: async () => options.recovery?.() ?? { kind: 'allowed' },
      checkFact: async ({ input }) => options.checkFact?.(input) ?? { kind: 'allowed' },
    },
    limits: options.limits ?? limits,
  })
  const rebuild = (...facts: ContextAccountingInput[]) =>
    accounting.recovery.rebuildAccounts({
      access: system,
      target,
      replay: { snapshot: evidence, facts: replayOf(...facts) },
    })
  return { ...accounting, adoptedSource, eligibility, rebuild }
}

describe('limits', () => {
  it.each([
    [undefined],
    [{ maxTargets: 0, maxFactsPerTarget: 1, maxRevisionsPerDispatch: 1 }],
    [{ maxTargets: 1, maxFactsPerTarget: 1.5, maxRevisionsPerDispatch: 1 }],
    [{ maxTargets: 1, maxFactsPerTarget: 1 }],
  ])('limits %j have no default and fail construction', value => {
    expect(() =>
      createContextAccounting<string>({
        ...({} as Parameters<typeof createContextAccounting<string>>[0]),
        limits: value as never,
      }),
    ).toThrow(TypeError)
  })
})

describe('receive', () => {
  it('a target that was never rebuilt is unavailable, not an empty index', async () => {
    const a = setup()
    expect(await a.inbox.receive({ access, input: fact() })).toEqual({
      kind: 'unavailable',
      diagnostic: 'uninitialized',
    })
  })
  it('inserts, recognizes the same value again, and conflicts on a different value', async () => {
    const a = setup()
    const rebuilt = await a.rebuild()
    if (rebuilt.kind !== 'rebuilt') throw new Error(rebuilt.kind)
    expect(await a.inbox.receive({ access, input: fact() })).toEqual({
      kind: 'received',
      generation: rebuilt.generation,
      change: 'inserted',
    })
    expect(await a.inbox.receive({ access, input: fact() })).toMatchObject({ change: 'duplicate' })
    expect(await a.inbox.receive({ access, input: fact('0', '701') })).toEqual({
      kind: 'conflict',
      field: 'account',
    })
  })
  it('a lower revision received late is superseded and the usage does not go back', async () => {
    const a = setup()
    await a.rebuild()
    await a.inbox.receive({ access, input: fact('2', '900') })
    expect(await a.inbox.receive({ access, input: fact('1', '100') })).toMatchObject({
      change: 'superseded',
    })
    a.adoptedSource.set(adopted())
    expect(await a.inbox.usage({ access, target })).toMatchObject({
      kind: 'value',
      value: { kind: 'actual', usedTokens: '900' },
    })
  })
  it('follows the fixed order: access tenant, call tenant, authority, account', async () => {
    const order: string[] = []
    const a = setup({
      source: () => {
        order.push('authority')
        return { kind: 'allowed' }
      },
    })
    await a.rebuild()
    expect(
      await a.inbox.receive({ access: { principal: 'p', tenant: tenantOf('9') }, input: fact() }),
    ).toEqual({
      kind: 'denied',
    })
    expect(
      await a.inbox.receive({
        access,
        input: fact('0', '700', { call: { tenant: tenantOf('9'), call } }),
      }),
    ).toMatchObject({ kind: 'invalid', reason: 'tenant-mismatch' })
    expect(order).toEqual([])
    const bad = { ...fact(), account: account('0', '700', 'mcall_other') }
    expect(await a.inbox.receive({ access, input: bad })).toMatchObject({
      reason: 'invalid-account',
    })
    expect(order).toEqual(['authority'])
  })
  it.each([
    [{ kind: 'denied' as const }],
    [{ kind: 'unknown' as const }],
    [{ kind: 'unavailable' as const, diagnostic: 'receiver offline' }],
  ])('a source verification %j keeps its class and writes nothing', async decision => {
    let answer: SourceDecision = decision
    const a = setup({ source: () => answer })
    await a.rebuild()
    expect(await a.inbox.receive({ access, input: fact() })).toEqual(decision)
    answer = { kind: 'allowed' }
    expect(await a.inbox.receive({ access, input: fact() })).toMatchObject({ change: 'inserted' })
  })
  it('capacity refuses new facts and never evicts old ones; a duplicate still answers', async () => {
    const a = setup({ limits: { maxTargets: 1, maxFactsPerTarget: 2, maxRevisionsPerDispatch: 4 } })
    await a.rebuild()
    await a.inbox.receive({ access, input: fact('0') })
    await a.inbox.receive({ access, input: fact('1') })
    expect(await a.inbox.receive({ access, input: fact('2') })).toEqual({
      kind: 'unavailable',
      diagnostic: 'capacity',
    })
    expect(await a.inbox.receive({ access, input: fact('0') })).toMatchObject({
      change: 'duplicate',
    })
  })
})

describe('rebuild', () => {
  it('needs the system recovery access; an ordinary access is invalid', async () => {
    const a = setup()
    expect(
      await a.recovery.rebuildAccounts({
        access: access as never,
        target,
        replay: { snapshot: evidence, facts: replayOf() },
      }),
    ).toMatchObject({ kind: 'invalid', field: 'access' })
  })
  it('a failed replay keeps the old index unserved and leaves the target not ready', async () => {
    const a = setup({
      checkFact: input =>
        input.account.revision === '1' ? { kind: 'denied' } : { kind: 'allowed' },
    })
    await a.rebuild(fact('0'))
    expect(await a.rebuild(fact('0'), fact('1'))).toEqual({ kind: 'denied' })
    expect(await a.inbox.receive({ access, input: fact('2') })).toMatchObject({
      kind: 'unavailable',
      diagnostic: 'uninitialized',
    })
    a.adoptedSource.set(adopted())
    expect(await a.inbox.usage({ access, target })).toMatchObject({ kind: 'unavailable' })
  })
  it('a replay that throws is unavailable and the target is not ready', async () => {
    const a = setup()
    async function* broken(): AsyncGenerator<ContextAccountingInput> {
      yield fact('0')
      throw new Error('log closed')
    }
    expect(
      await a.recovery.rebuildAccounts({
        access: system,
        target,
        replay: { snapshot: evidence, facts: broken() },
      }),
    ).toMatchObject({ kind: 'unavailable' })
    expect(await a.inbox.receive({ access, input: fact('1') })).toMatchObject({
      diagnostic: 'uninitialized',
    })
  })
  it('a receive during the rebuild is unavailable, and a new generation follows', async () => {
    const a = setup()
    const first = await a.rebuild()
    if (first.kind !== 'rebuilt') throw new Error(first.kind)
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    async function* slow(): AsyncGenerator<ContextAccountingInput> {
      await gate
      yield fact('0')
    }
    const running = a.recovery.rebuildAccounts({
      access: system,
      target,
      replay: { snapshot: evidence, facts: slow() },
    })
    await Promise.resolve()
    expect(await a.inbox.receive({ access, input: fact('1') })).toEqual({
      kind: 'unavailable',
      diagnostic: 'rebuilding',
    })
    release()
    const second = await running
    if (second.kind !== 'rebuilt') throw new Error(second.kind)
    expect(second.generation).not.toBe(first.generation)
  })
  it('replay applies the same idempotency as receive', async () => {
    const a = setup()
    expect(await a.rebuild(fact('0'), fact('0'))).toMatchObject({ kind: 'rebuilt' })
    expect(await a.rebuild(fact('0'), fact('0', '1'))).toEqual({
      kind: 'conflict',
      field: 'account',
    })
  })
})

describe('usage: the four window states', () => {
  it('is unavailable before the target is rebuilt', async () => {
    const a = setup()
    expect(await a.inbox.usage({ access, target })).toMatchObject({ kind: 'unavailable' })
  })
  it('is not-fixed when nothing is adopted', async () => {
    const a = setup()
    await a.rebuild()
    expect(await a.inbox.usage({ access, target })).toEqual({
      kind: 'value',
      value: { kind: 'not-fixed' },
    })
  })
  it('is unmeasured without an account or a forecast, estimate with a forecast, actual with the account', async () => {
    const a = setup()
    await a.rebuild()
    a.adoptedSource.set(adopted())
    expect(await a.inbox.usage({ access, target })).toMatchObject({
      value: { kind: 'unmeasured', windowTokens: '1000' },
    })
    a.adoptedSource.set(adopted({ forecast: { kind: 'estimate', usedTokens: '400' } }))
    expect(await a.inbox.usage({ access, target })).toMatchObject({
      value: { kind: 'estimate', usedTokens: '400', ratio: '0.4' },
    })
    await a.inbox.receive({ access, input: fact('0', '1001') })
    expect(await a.inbox.usage({ access, target })).toMatchObject({
      value: { kind: 'actual', usedTokens: '1001', ratio: '1.001' },
    })
  })
  it('an account of an older dispatch never stands in for the current adoption', async () => {
    const a = setup()
    await a.rebuild()
    await a.inbox.receive({ access, input: fact('0', '900') })
    a.adoptedSource.set(
      adopted({ accounting: { kind: 'unique', dispatch: must(decodeDispatchId('mdisp_two')) } }),
    )
    expect(await a.inbox.usage({ access, target })).toMatchObject({ value: { kind: 'unmeasured' } })
    a.adoptedSource.set(adopted({ accounting: { kind: 'multiple' } }))
    expect(await a.inbox.usage({ access, target })).toMatchObject({ value: { kind: 'unmeasured' } })
  })
  it('an adoption that keeps changing is unavailable after two attempts', async () => {
    const a = setup()
    await a.rebuild()
    let n = 0
    const again = () =>
      a.adoptedSource.afterSourceRead(() => {
        a.adoptedSource.set(adopted({ windowTokens: String(1000 + ++n) }))
        again()
      })
    again()
    expect(await a.inbox.usage({ access, target })).toEqual({
      kind: 'unavailable',
      diagnostic: 'unstable-input:adopted',
    })
    expect(a.adoptedSource.reads()).toBe(2)
  })
  it('an access of another tenant is denied; withdrawn eligibility keeps its class', async () => {
    const a = setup()
    await a.rebuild()
    expect(
      await a.inbox.usage({ access: { principal: 'p', tenant: tenantOf('9') }, target }),
    ).toEqual({
      kind: 'denied',
    })
    a.eligibility.set({ kind: 'denied' })
    expect(await a.inbox.usage({ access, target })).toEqual({ kind: 'denied' })
  })
})
