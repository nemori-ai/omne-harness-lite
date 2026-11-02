// The account outlet of Agent as a Request Context account fact (SPEC "账目出站").
import { describe, expect, it } from 'vitest'
import type { AgentAccountHandoff, AgentAccountOutcome } from '@omne-harness/agent-contract'
import {
  agentAccountOutletConformance,
  sampleAccountHandoff,
  type ConformanceCase,
} from '@omne-harness/agent-contract/testing'
import { decodeResultVersion, resolveModelInvocationRef } from '@omne-harness/model-contract'
import {
  decodeCandidateRef,
  decodeCommitOrder,
  type AccountReceipt,
  type AdoptedRequestFact,
  type ContextAccountingInbox,
  type ContextAccountingInput,
  type ContextTarget,
} from '@omne-harness/request-context-contract'
import {
  absentAccountTarget,
  createAgentAccountOutlet,
  type AccountTargetResolver,
} from '@omne-harness/agent-context'
import { access, otherAccess, realInbox, sender, targetOf } from './fixtures/outlet-world.ts'

/** The target of the call's own tenant. */
const resolveOwn: AccountTargetResolver<string> = async ({ call }) => targetOf(call.tenant)

const must = <T>(decoded: { ok: T } | { failure: unknown }): T => {
  if ('failure' in decoded) throw new Error('the fixture value is invalid')
  return decoded.ok
}

/** An inbox that answers `answer` to every fact and keeps what it was given. */
function stubInbox(answer: () => Promise<AccountReceipt> | AccountReceipt) {
  const facts: ContextAccountingInput[] = []
  const inbox: ContextAccountingInbox<string> = {
    receive: async ({ input }) => {
      facts.push(input)
      return answer()
    },
    usage: async () => ({ kind: 'unavailable', diagnostic: 'unused' }),
  }
  return { inbox, facts }
}
const receivedOnce: AccountReceipt = {
  kind: 'received',
  generation: 'accounting_1' as never,
  change: 'inserted',
}

describe('the conformance suite of AgentAccountOutlet', () => {
  it('passes every case, over a real account projection', async () => {
    const inbox = await realInbox([targetOf(access.tenant), targetOf(otherAccess.tenant)])
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: resolveOwn })
    const cases: readonly ConformanceCase[] = agentAccountOutletConformance({
      outlet,
      access,
      otherAccess,
      current: async (who, handoff) => {
        const call = resolveModelInvocationRef(handoff.call, who.tenant)
        if (!('ok' in call)) return null
        return inbox.current(call.ok.call, handoff.dispatch)
      },
    })
    expect(cases.length).toBeGreaterThan(0)
    for (const entry of cases) {
      await entry.run().catch((error: unknown) => {
        throw new Error(`case "${entry.name}" failed`, { cause: error })
      })
    }
  })
})

describe('the fact handed to the inbox', () => {
  it('carries the handoff and the resolved target, field by field', async () => {
    const { inbox, facts } = stubInbox(() => receivedOnce)
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: resolveOwn })
    const version = must(decodeResultVersion('mrver_one'))
    const handoff: AgentAccountHandoff = {
      ...sampleAccountHandoff(access.tenant, 'fields'),
      resultVersion: version,
    }
    expect(await outlet.deliver({ access, handoff })).toEqual({ kind: 'received' })
    const call = resolveModelInvocationRef(handoff.call, access.tenant)
    if (!('ok' in call)) throw new Error('the fixture reference should resolve')
    expect(facts).toEqual([
      {
        kind: 'account',
        origin: { producer: 'model', sender, resultVersion: version },
        target: targetOf(access.tenant),
        call: { tenant: access.tenant, call: call.ok.call },
        dispatch: handoff.dispatch,
        account: handoff.account,
        committed: handoff.committed,
      },
    ])
  })

  it('hands the resolver the access and the decoded call, and asks once', async () => {
    const { inbox } = stubInbox(() => receivedOnce)
    const asked: unknown[] = []
    const outlet = createAgentAccountOutlet({
      inbox,
      sender,
      resolveTarget: async input => {
        asked.push(input)
        return targetOf(input.call.tenant)
      },
    })
    const handoff = sampleAccountHandoff(access.tenant, 'asked')
    await outlet.deliver({ access, handoff })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ access, call: { tenant: access.tenant } })
  })
})

describe('a tenant that is not the tenant of the call', () => {
  it('is denied before the resolver and the inbox are asked', async () => {
    const { inbox, facts } = stubInbox(() => receivedOnce)
    let resolved = 0
    const outlet = createAgentAccountOutlet({
      inbox,
      sender,
      resolveTarget: async input => {
        resolved++
        return targetOf(input.call.tenant)
      },
    })
    const handoff = sampleAccountHandoff(otherAccess.tenant, 'foreign')
    expect(await outlet.deliver({ access, handoff })).toEqual({ kind: 'denied' })
    expect(resolved).toBe(0)
    expect(facts).toHaveLength(0)
  })

  it('is denied before the target is missing, so a foreign call never learns the scope state', async () => {
    const { inbox } = stubInbox(() => receivedOnce)
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
    const handoff = sampleAccountHandoff(otherAccess.tenant, 'foreign-absent')
    expect(await outlet.deliver({ access, handoff })).toEqual({ kind: 'denied' })
  })

  it('is denied when the resolver answers a target of another tenant, and nothing is received', async () => {
    const { inbox, facts } = stubInbox(() => receivedOnce)
    const outlet = createAgentAccountOutlet({
      inbox,
      sender,
      resolveTarget: async () => targetOf(otherAccess.tenant),
    })
    const handoff = sampleAccountHandoff(access.tenant, 'wrong-target')
    expect(await outlet.deliver({ access, handoff })).toEqual({ kind: 'denied' })
    expect(facts).toHaveLength(0)
  })
})

describe('an absent target resolver (ACCT-TARGET)', () => {
  it('answers unavailable with scope-unresolved and never reaches the inbox', async () => {
    const { inbox, facts } = stubInbox(() => receivedOnce)
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
    const handoff = sampleAccountHandoff(access.tenant, 'absent')
    expect(await outlet.deliver({ access, handoff })).toEqual({
      kind: 'unavailable',
      diagnostic: 'scope-unresolved',
    })
    expect(facts).toHaveLength(0)
  })

  it('answers the same for every delivery, so the receiver keeps its duty and can retry', async () => {
    const { inbox } = stubInbox(() => receivedOnce)
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
    const handoff = sampleAccountHandoff(access.tenant, 'again')
    const first = await outlet.deliver({ access, handoff })
    const second = await outlet.deliver({ access, handoff })
    expect(first).toEqual(second)
    expect(first.kind).toBe('unavailable')
  })

  it('is unavailable, not received, when the resolver throws', async () => {
    const { inbox, facts } = stubInbox(() => receivedOnce)
    const outlet = createAgentAccountOutlet({
      inbox,
      sender,
      resolveTarget: async () => {
        throw new Error('resolver crashed')
      },
    })
    const handoff = sampleAccountHandoff(access.tenant, 'crash')
    expect(await outlet.deliver({ access, handoff })).toEqual({
      kind: 'unavailable',
      diagnostic: 'scope-resolver-failed',
    })
    expect(facts).toHaveLength(0)
  })
})

describe('the answer of the inbox', () => {
  const generation = 'accounting_1' as never
  const table: readonly (readonly [string, AccountReceipt, AgentAccountOutcome])[] = [
    [
      'received, inserted',
      { kind: 'received', generation, change: 'inserted' },
      { kind: 'received' },
    ],
    [
      'received, duplicate',
      { kind: 'received', generation, change: 'duplicate' },
      { kind: 'received' },
    ],
    [
      'received, superseded',
      { kind: 'received', generation, change: 'superseded' },
      { kind: 'received' },
    ],
    ['denied', { kind: 'denied' }, { kind: 'denied' }],
    ['conflict', { kind: 'conflict', field: 'account' }, { kind: 'conflict' }],
    [
      'invalid',
      { kind: 'invalid', field: 'input.account', reason: 'invalid-account' },
      { kind: 'invalid', field: 'input.account', reason: 'invalid-account' },
    ],
    ['unknown', { kind: 'unknown' }, { kind: 'unknown' }],
    [
      'unavailable',
      { kind: 'unavailable', diagnostic: 'uninitialized' },
      { kind: 'unavailable', diagnostic: 'uninitialized' },
    ],
  ]
  it.each(table)('%s maps by name to the port answer', async (_name, receipt, expected) => {
    const { inbox } = stubInbox(() => receipt)
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: resolveOwn })
    const handoff = sampleAccountHandoff(access.tenant, 'mapped')
    expect(await outlet.deliver({ access, handoff })).toEqual(expected)
  })

  it('is unknown, never received, when the inbox throws: the write may have happened', async () => {
    const { inbox } = stubInbox(() => {
      throw new Error('inbox crashed')
    })
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: resolveOwn })
    const handoff = sampleAccountHandoff(access.tenant, 'inbox-crash')
    expect(await outlet.deliver({ access, handoff })).toEqual({ kind: 'unknown' })
  })

  it('keeps nothing between deliveries: it neither caches the answer nor retries', async () => {
    let asked = 0
    const { inbox } = stubInbox(() => {
      asked++
      return { kind: 'unavailable', diagnostic: 'rebuilding' }
    })
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: resolveOwn })
    const handoff = sampleAccountHandoff(access.tenant, 'nocache')
    await outlet.deliver({ access, handoff })
    expect(asked).toBe(1)
    await outlet.deliver({ access, handoff })
    expect(asked).toBe(2)
  })
})

describe('the outlet over a real account projection (composition)', () => {
  it('delivers an account that the projection then reports as actual', async () => {
    const target: ContextTarget = targetOf(access.tenant)
    const inbox = await realInbox([target])
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: resolveOwn })
    const base = sampleAccountHandoff(access.tenant, 'actual')
    const handoff: AgentAccountHandoff = {
      ...base,
      account: {
        ...base.account,
        usage: [
          { name: 'input', state: 'known', lexeme: '700', unit: 'token' },
          { name: 'cache-read', state: 'known', lexeme: '0', unit: 'token' },
          { name: 'cache-write', state: 'known', lexeme: '0', unit: 'token' },
        ],
      },
    }
    expect(await outlet.deliver({ access, handoff })).toEqual({ kind: 'received' })
    const call = resolveModelInvocationRef(handoff.call, access.tenant)
    if (!('ok' in call)) throw new Error('the fixture reference should resolve')
    inbox.adopted.set(adoptedFact(target, call.ok.call, handoff.dispatch))
    expect(await inbox.usage({ access, target })).toMatchObject({
      kind: 'value',
      value: { kind: 'actual', usedTokens: '700', windowTokens: '1000' },
    })
  })

  it('answers unavailable when the target was never rebuilt, and the projection keeps nothing', async () => {
    const inbox = await realInbox([])
    const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: resolveOwn })
    const handoff = sampleAccountHandoff(access.tenant, 'uninitialized')
    expect(await outlet.deliver({ access, handoff })).toEqual({
      kind: 'unavailable',
      diagnostic: 'uninitialized',
    })
  })
})

function adoptedFact(
  target: ContextTarget,
  call: AdoptedRequestFact['call']['call'],
  dispatch: AgentAccountHandoff['dispatch'],
): AdoptedRequestFact {
  return {
    coverage: null as never,
    target,
    call: { tenant: target.tenant, call },
    candidate: must(decodeCandidateRef('candidate:1')),
    order: must(decodeCommitOrder('1')),
    committed: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
    windowTokens: '1000',
    accounting: { kind: 'unique', dispatch },
    forecast: null,
    continuation: null,
  }
}
