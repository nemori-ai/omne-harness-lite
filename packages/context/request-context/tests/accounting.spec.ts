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
  type AdoptedRequestSource,
  type ContextReadEligibility,
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
    source?: () => SourceDecision | Promise<SourceDecision>
    recovery?: () => SourceDecision | Promise<SourceDecision>
    checkFact?: (input: ContextAccountingInput) => SourceDecision
    limits?: AccountingLimits
    eligibility?: ContextReadEligibility<string>
    adopted?: AdoptedRequestSource<string>
  } = {},
) {
  const adoptedSource = createMemoryAdoptedSource<string>()
  const eligibility = createMemoryReadEligibility<string>()
  const accounting = createContextAccounting<string>({
    sourceAuthority: { check: async () => (await options.source?.()) ?? { kind: 'allowed' } },
    readEligibility: options.eligibility ?? eligibility,
    adoptedSource: options.adopted ?? adoptedSource,
    recoveryAuthority: {
      check: async () => (await options.recovery?.()) ?? { kind: 'allowed' },
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
  const rebuildAt = (at: ContextTarget, ...facts: ContextAccountingInput[]) =>
    accounting.recovery.rebuildAccounts({
      access: system,
      target: at,
      replay: { snapshot: evidence, facts: replayOf(...facts) },
    })
  return { ...accounting, adoptedSource, eligibility, rebuild, rebuildAt }
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

function withUsage(usage: CallAccount['usage'], revision = '0'): ContextAccountingInput {
  return { ...fact(revision), account: { ...account(revision), usage } }
}
const token = (name: string, lexeme: string) =>
  ({ name, state: 'known', lexeme, unit: 'token' }) as CallAccount['usage'][number]
function deferred<T>() {
  let open: (value: T) => void = () => {}
  const promise = new Promise<T>(resolve => {
    open = resolve
  })
  return { promise, open }
}

describe('receive: the fixed order of checks', () => {
  it('a receive without access is invalid', async () => {
    const a = setup()
    await a.rebuild()
    expect(await a.inbox.receive({ access: null as never, input: fact() })).toEqual({
      kind: 'invalid',
      field: 'access',
      reason: 'missing-access',
    })
  })
  it.each([
    ['not an object', 'x'],
    ['another kind', { ...fact(), kind: 'other' }],
    ['no origin', { ...fact(), origin: null }],
    ['no target', { ...fact(), target: 'scope' }],
    ['no call', { ...fact(), call: [] }],
    ['a dispatch that is not text', { ...fact(), dispatch: 7 }],
    ['no commit evidence', { ...fact(), committed: null }],
  ])(
    'a fact with %s is unsupported, and shape comes before the access tenant',
    async (_name, bad) => {
      const authorityCalls: string[] = []
      const a = setup({
        source: () => {
          authorityCalls.push('check')
          return { kind: 'allowed' }
        },
      })
      await a.rebuild()
      const stranger = { principal: 'p', tenant: tenantOf('9') }
      expect(await a.inbox.receive({ access: stranger, input: bad as never })).toEqual({
        kind: 'invalid',
        field: 'input',
        reason: 'unsupported-format',
      })
      expect(authorityCalls).toEqual([])
    },
  )
  it.each([
    ['a producer that is not model', { origin: { producer: 'tool', sender, resultVersion: null } }],
    [
      'a subject that is not a model call',
      { account: { ...account('0'), subject: { kind: 'tool_call', id: call } } },
    ],
    ['an account its owner refuses', { account: { ...account('0'), revision: 'x' } }],
  ])('%s is an invalid account', async (_name, change) => {
    const a = setup()
    await a.rebuild()
    expect(
      await a.inbox.receive({ access, input: { ...fact(), ...change } as never }),
    ).toMatchObject({
      kind: 'invalid',
      field: 'input.account',
      reason: 'invalid-account',
    })
  })
  it('a target that starts rebuilding while the source is verified is unavailable', async () => {
    const gate = deferred<SourceDecision>()
    let answer: () => SourceDecision | Promise<SourceDecision> = () => ({ kind: 'allowed' })
    const a = setup({ source: () => answer(), recovery: () => ({ kind: 'allowed' }) })
    await a.rebuild()
    answer = () => gate.promise
    const pending = a.inbox.receive({ access, input: fact() })
    const replay = deferred<void>()
    async function* slow(): AsyncGenerator<ContextAccountingInput> {
      await replay.promise
      yield* []
    }
    const rebuilding = a.recovery.rebuildAccounts({
      access: system,
      target,
      replay: { snapshot: evidence, facts: slow() },
    })
    await Promise.resolve()
    gate.open({ kind: 'allowed' })
    expect(await pending).toEqual({ kind: 'unavailable', diagnostic: 'rebuilding' })
    replay.open()
    expect((await rebuilding).kind).toBe('rebuilt')
  })
  it('a higher revision after a lower one is inserted and becomes current', async () => {
    const a = setup()
    await a.rebuild()
    await a.inbox.receive({ access, input: fact('1', '100') })
    expect(await a.inbox.receive({ access, input: fact('2', '200') })).toMatchObject({
      change: 'inserted',
    })
    a.adoptedSource.set(adopted())
    expect(await a.inbox.usage({ access, target })).toMatchObject({ value: { usedTokens: '200' } })
  })
  it('revisions per dispatch are capped; another dispatch still has room', async () => {
    const a = setup({ limits: { maxTargets: 2, maxFactsPerTarget: 8, maxRevisionsPerDispatch: 2 } })
    await a.rebuild()
    await a.inbox.receive({ access, input: fact('0') })
    await a.inbox.receive({ access, input: fact('1') })
    expect(await a.inbox.receive({ access, input: fact('2') })).toEqual({
      kind: 'unavailable',
      diagnostic: 'capacity',
    })
    const other = { ...fact('0'), dispatch: must(decodeDispatchId('mdisp_two')) }
    expect(await a.inbox.receive({ access, input: other })).toMatchObject({ change: 'inserted' })
  })
})

describe('only a complete known token input is actual', () => {
  it.each([
    [
      'a provisional item',
      [
        token('input', '700'),
        { ...token('cache-read', '0'), state: 'provisional' },
        token('cache-write', '0'),
      ],
    ],
    ['a missing cache-read', [token('input', '700'), token('cache-write', '0')]],
    [
      'an item in another unit',
      [
        token('input', '700'),
        { ...token('cache-read', '0'), unit: 'byte' },
        token('cache-write', '0'),
      ],
    ],
    [
      'an unknown item',
      [
        token('input', '700'),
        { name: 'cache-read', state: 'unknown', unit: 'token' },
        token('cache-write', '0'),
      ],
    ],
    [
      'a repeated input item (500 + 300)',
      [
        token('input', '500'),
        token('input', '300'),
        token('cache-read', '0'),
        token('cache-write', '0'),
      ],
    ],
  ])('%s gives estimate or unmeasured, never actual', async (_name, usage) => {
    const a = setup()
    await a.rebuild()
    expect(
      await a.inbox.receive({ access, input: withUsage(usage as CallAccount['usage']) }),
    ).toMatchObject({
      kind: 'received',
    })
    a.adoptedSource.set(adopted())
    expect(await a.inbox.usage({ access, target })).toMatchObject({ value: { kind: 'unmeasured' } })
  })
  it('the three items are added', async () => {
    const a = setup()
    await a.rebuild()
    await a.inbox.receive({
      access,
      input: withUsage([
        token('input', '100'),
        token('cache-read', '20'),
        token('cache-write', '3'),
      ]),
    })
    a.adoptedSource.set(adopted())
    expect(await a.inbox.usage({ access, target })).toMatchObject({
      value: { kind: 'actual', usedTokens: '123', ratio: '0.123' },
    })
  })
})

describe('usage: the adopted fact is parsed at the boundary', () => {
  it.each([
    ['windowTokens', { windowTokens: '0' }],
    ['windowTokens', { windowTokens: 'abc' }],
    ['forecast.usedTokens', { forecast: { kind: 'estimate', usedTokens: 'abc' } }],
    ['forecast', { forecast: { kind: 'guess', usedTokens: '1' } }],
    ['accounting', { accounting: { kind: 'some' } }],
    ['accounting.dispatch', { accounting: { kind: 'unique', dispatch: '' } }],
    ['order', { order: 'x' }],
  ])('a bad %s is the named invalid result, never a thrown error', async (field, change) => {
    const a = setup()
    await a.rebuild()
    a.adoptedSource.set({ ...adopted(), ...change } as never)
    expect(await a.inbox.usage({ access, target })).toEqual({
      kind: 'invalid',
      field: `adopted.${field}`,
      reason: 'unsupported-format',
    })
  })
  it.each([
    ['target tenant', { target: { tenant: tenantOf('9'), scope: target.scope } }],
    ['call tenant', { call: { tenant: tenantOf('9'), call } }],
    ['scope', { target: { tenant, scope: { ...target.scope, ref: 'scope:other' } } }],
  ])('an adopted fact of another %s contradicts the source', async (_name, change) => {
    const a = setup()
    await a.rebuild()
    a.adoptedSource.set({ ...adopted(), ...change } as never)
    expect(await a.inbox.usage({ access, target })).toMatchObject({
      kind: 'invalid',
      reason: 'source-evidence-conflict',
    })
  })
})

describe('usage: reads keep their class and publication is checked last', () => {
  it('a usage without access is invalid', async () => {
    const a = setup()
    expect(await a.inbox.usage({ access: null as never, target })).toMatchObject({
      kind: 'invalid',
      field: 'access',
    })
  })
  it.each([[{ kind: 'unknown' as const }], [{ kind: 'unavailable' as const, diagnostic: 'gone' }]])(
    'eligibility %j is returned without observing the index',
    async decision => {
      const a = setup()
      await a.rebuild()
      a.eligibility.set(decision)
      expect(await a.inbox.usage({ access, target })).toEqual(decision)
      expect(a.adoptedSource.reads()).toBe(0)
    },
  )
  it.each(['before', 'source', 'after', 'last'] as const)(
    'a %s read of the adopted source that fails keeps its class',
    async step => {
      let counts = 0
      const failing: AdoptedRequestSource<string> = {
        authority: sender,
        async readCount() {
          counts++
          const failAt = step === 'before' ? 1 : step === 'after' ? 2 : step === 'last' ? 3 : 0
          return counts === failAt ? { kind: 'unknown' } : { kind: 'value', value: 'c' as never }
        },
        async readSource() {
          return step === 'source' ? { kind: 'unknown' } : { kind: 'value', value: null }
        },
      }
      const a = setup({ adopted: failing })
      await a.rebuild()
      expect(await a.inbox.usage({ access, target })).toEqual({ kind: 'unknown' })
    },
  )
  it('a count that moves before publication discards the attempt and reads again', async () => {
    let counts = 0
    const moving: AdoptedRequestSource<string> = {
      authority: sender,
      async readCount() {
        counts++
        return {
          kind: 'value',
          value: (counts === 3 ? 'moved' : `c${counts > 3 ? 2 : 1}`) as never,
        }
      },
      async readSource() {
        return { kind: 'value', value: null }
      },
    }
    const a = setup({ adopted: moving })
    await a.rebuild()
    expect(await a.inbox.usage({ access, target })).toEqual({
      kind: 'value',
      value: { kind: 'not-fixed' },
    })
    expect(counts).toBe(6)
  })
  it('eligibility withdrawn before publication drops the value', async () => {
    let checks = 0
    const flipping: ContextReadEligibility<string> = {
      async check() {
        checks++
        return checks === 2 ? { kind: 'denied' } : { kind: 'allowed', revision: 'r' as never }
      },
    }
    const a = setup({ eligibility: flipping })
    await a.rebuild()
    expect(await a.inbox.usage({ access, target })).toEqual({ kind: 'denied' })
  })
  it('a projection rebuilt between the value and publication is unavailable', async () => {
    let a: ReturnType<typeof setup> | null = null
    let checks = 0
    const rebuilding: ContextReadEligibility<string> = {
      async check() {
        checks++
        if (checks === 2 && a !== null) await a.rebuild()
        return { kind: 'allowed', revision: 'r' as never }
      },
    }
    a = setup({ eligibility: rebuilding })
    await a.rebuild()
    expect(await a.inbox.usage({ access, target })).toEqual({
      kind: 'unavailable',
      diagnostic: 'Account projection changed',
    })
  })
  it('an unknown target is unavailable as not initialized', async () => {
    const a = setup()
    expect(await a.inbox.usage({ access, target })).toEqual({
      kind: 'unavailable',
      diagnostic: 'uninitialized',
    })
  })
})

describe('rebuild: access, capacity and failure paths', () => {
  it.each([
    ['an ordinary access', { principal: 'p', tenant }],
    ['another scope', { ...system, scope: 'tenant' }],
    ['a grant that is not text', { ...system, grant: 7 }],
    ['no access', null],
  ])('%s is invalid', async (_name, value) => {
    const a = setup()
    expect(
      await a.recovery.rebuildAccounts({
        access: value as never,
        target,
        replay: { snapshot: evidence, facts: replayOf() },
      }),
    ).toMatchObject({ kind: 'invalid', field: 'access' })
  })
  it('a refused first decision changes nothing', async () => {
    const a = setup({ recovery: () => ({ kind: 'denied' }) })
    expect(await a.rebuild()).toEqual({ kind: 'denied' })
    expect(await a.inbox.receive({ access, input: fact() })).toMatchObject({
      diagnostic: 'uninitialized',
    })
  })
  it('a second rebuild of a target that is rebuilding is unavailable', async () => {
    const a = setup()
    const gate = deferred<void>()
    async function* slow(): AsyncGenerator<ContextAccountingInput> {
      await gate.promise
      yield* []
    }
    const first = a.recovery.rebuildAccounts({
      access: system,
      target,
      replay: { snapshot: evidence, facts: slow() },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(await a.rebuild()).toEqual({ kind: 'unavailable', diagnostic: 'rebuilding' })
    gate.open()
    expect((await first).kind).toBe('rebuilt')
  })
  it('maxTargets refuses a new target; rebuilding a known target needs no new slot', async () => {
    const a = setup({ limits: { maxTargets: 1, maxFactsPerTarget: 8, maxRevisionsPerDispatch: 4 } })
    await a.rebuild()
    const other: ContextTarget = { tenant, scope: { ...target.scope, ref: 'scope:other' } as never }
    expect(await a.rebuildAt(other)).toEqual({ kind: 'unavailable', diagnostic: 'capacity' })
    expect((await a.rebuild()).kind).toBe('rebuilt')
  })
  it('a failed rebuild of a new target gives its capacity slot back', async () => {
    const a = setup({
      limits: { maxTargets: 1, maxFactsPerTarget: 8, maxRevisionsPerDispatch: 4 },
      checkFact: () => ({ kind: 'denied' }),
    })
    const other: ContextTarget = { tenant, scope: { ...target.scope, ref: 'scope:other' } as never }
    expect(await a.rebuildAt(other, { ...fact(), target: other })).toEqual({ kind: 'denied' })
    expect((await a.rebuild()).kind).toBe('rebuilt')
  })
  it.each([
    ['a bad shape', () => 'x' as never, 'unsupported-format'],
    [
      'another scope',
      () => ({ ...fact(), target: { tenant, scope: { ...target.scope, ref: 'scope:other' } } }),
      'tenant-mismatch',
    ],
    [
      'another target tenant',
      () => ({ ...fact(), target: { tenant: tenantOf('9'), scope: target.scope } }),
      'tenant-mismatch',
    ],
    [
      'another call tenant',
      () => ({ ...fact(), call: { tenant: tenantOf('9'), call } }),
      'tenant-mismatch',
    ],
    [
      'an invalid account',
      () => ({ ...fact(), account: { ...account('0'), revision: 'x' } }),
      'invalid-account',
    ],
  ])(
    'a replayed fact with %s fails the rebuild and the target is not ready',
    async (_n, make, reason) => {
      const a = setup()
      expect(await a.rebuild(make() as never)).toMatchObject({ kind: 'invalid', reason })
      expect(await a.inbox.receive({ access, input: fact() })).toMatchObject({
        diagnostic: 'uninitialized',
      })
    },
  )
  it('a refused or throwing final decision leaves the target not ready and not stuck', async () => {
    let calls = 0
    let mode: 'deny' | 'throw' | 'allow' = 'deny'
    const a = setup({
      recovery: () => {
        calls++
        if (calls % 2 === 1) return { kind: 'allowed' }
        if (mode === 'throw') throw new Error('authority crashed')
        return mode === 'deny' ? { kind: 'denied' } : { kind: 'allowed' }
      },
    })
    expect(await a.rebuild()).toEqual({ kind: 'denied' })
    mode = 'throw'
    expect(await a.rebuild()).toMatchObject({ kind: 'unavailable' })
    expect(await a.inbox.receive({ access, input: fact() })).toMatchObject({
      diagnostic: 'uninitialized',
    })
    mode = 'allow'
    expect((await a.rebuild()).kind).toBe('rebuilt')
  })
  it('each successful rebuild takes a new generation', async () => {
    const a = setup()
    const first = await a.rebuild()
    const second = await a.rebuild()
    if (first.kind !== 'rebuilt' || second.kind !== 'rebuilt') throw new Error('rebuild')
    expect(second.generation).not.toBe(first.generation)
    expect(await a.inbox.receive({ access, input: fact() })).toMatchObject({
      generation: second.generation,
    })
  })
})
