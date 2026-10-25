// The AgentAccountOutlet conformance suite (SPEC "账目出站", J28) and a non-durable double that
// passes it. The double stands in for the adapter on the side of Request Context: it keeps the
// current revision of each (tenant, call, dispatch) and answers a repeated handoff the same.
import assert from 'node:assert/strict'
import { admitRevision, judgeCallAccount, type CallAccount } from '@omne-harness/call-account'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { Access, DurableEvidence } from './identity.ts'
import type { AgentAccountHandoff, AgentAccountOutcome, AgentAccountOutlet } from './receiving.ts'
import { canonicalText, tenantText, type ConformanceCase } from './testing-case.ts'

/** A non-durable double of the account outlet. It must not be assembled into production. */
export interface MemoryAgentAccountOutlet<P> extends AgentAccountOutlet<P> {
  readonly durability: 'none'
  /** The current handoff of each dispatch of `tenant`, in the order of first arrival. */
  received(tenant: TenantId): readonly AgentAccountHandoff[]
}

type Kept = { current: AgentAccountHandoff; readonly revisions: Map<string, string> }

/** Creates the double. */
export function createMemoryAgentAccountOutlet<P>(): MemoryAgentAccountOutlet<P> {
  const kept = new Map<string, Map<string, Kept>>()
  return {
    durability: 'none',
    async deliver({ access, handoff }): Promise<AgentAccountOutcome> {
      const call = resolveModelInvocationRef(handoff.call, access.tenant)
      if (!('ok' in call)) {
        return call.failure.kind === 'foreign-tenant'
          ? { kind: 'denied' }
          : { kind: 'invalid', field: 'handoff.call', reason: 'reference-malformed' }
      }
      const judged = judgeCallAccount(handoff.account)
      if ('rejected' in judged) {
        return { kind: 'invalid', field: 'handoff.account', reason: judged.rejected }
      }
      const account = judged.ok
      if (account.subject.kind !== 'model_call' || account.subject.id !== call.ok.call) {
        return { kind: 'invalid', field: 'handoff.account', reason: 'call-mismatch' }
      }
      const tenant = tenantText(access.tenant)
      const dispatches = kept.get(tenant) ?? new Map<string, Kept>()
      kept.set(tenant, dispatches)
      const dispatchKey = `${call.ok.call}\u0000${handoff.dispatch}`
      const text = canonicalText(account)
      const known = dispatches.get(dispatchKey)
      if (known === undefined) {
        dispatches.set(dispatchKey, {
          current: structuredClone(handoff),
          revisions: new Map([[account.revision, text]]),
        })
        return { kind: 'received' }
      }
      const earlier = known.revisions.get(account.revision)
      if (earlier !== undefined)
        return earlier === text ? { kind: 'received' } : { kind: 'conflict' }
      known.revisions.set(account.revision, text)
      // call-account owns the revision order: the higher revision of the same subject wins.
      const winner = admitRevision(known.current.account, account)
      if ('ok' in winner && winner.ok.revision === account.revision) {
        known.current = structuredClone(handoff)
      }
      return { kind: 'received' }
    },
    received(tenant) {
      return [...(kept.get(tenantText(tenant))?.values() ?? [])].map(entry => entry.current)
    },
  }
}

/**
 * What the suite needs from a provider. `access` and `otherAccess` belong to two different
 * tenants. `current` reads the current account revision that the provider keeps for one dispatch,
 * or null when it keeps none.
 */
export interface AgentAccountOutletFixture<P> {
  readonly outlet: AgentAccountOutlet<P>
  readonly access: Access<P>
  readonly otherAccess: Access<P>
  current(access: Access<P>, handoff: AgentAccountHandoff): Promise<string | null>
}

function identity<T>(decoded: Outcome<T, unknown>, what: string): T {
  if (!('ok' in decoded)) throw new TypeError(`the suite value ${what} is invalid`)
  return decoded.ok
}

const committed = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: 'd',
})

/** A handoff of the suite for one dispatch of a call that `tenant` owns. */
export function sampleAccountHandoff(
  tenant: TenantId,
  name: string,
  revision = '0',
  lexeme = '12',
): AgentAccountHandoff {
  const call = identity(decodeModelCallId(`mcall_${name}`), name)
  const account: CallAccount = {
    subject: { kind: 'model_call', id: call },
    usage: [{ name: 'input', state: 'known', lexeme, unit: 'token' }],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'suite',
    duration: { state: 'unknown' },
    receipt: 'received',
    revision,
  }
  return {
    call: identity(
      encodeModelInvocationRef({
        tenant,
        call,
        admission: identity(decodeModelOperationId(`mop_${name}`), name),
      }),
      name,
    ),
    dispatch: identity(decodeDispatchId(`mdisp_${name}`), name),
    account,
    resultVersion: null,
    committed: committed(`received-${name}-${revision}`),
  }
}

/** The cases that a provider of `AgentAccountOutlet` passes. */
export function agentAccountOutletConformance<P>(
  fixture: AgentAccountOutletFixture<P>,
): readonly ConformanceCase[] {
  const { outlet, access, otherAccess } = fixture
  const deliver = (who: Access<P>, handoff: AgentAccountHandoff) =>
    outlet.deliver({ access: who, handoff })
  return [
    {
      name: 'receives a new handoff and the same handoff again',
      async run() {
        const handoff = sampleAccountHandoff(access.tenant, 'again')
        assert.deepEqual(await deliver(access, handoff), { kind: 'received' })
        assert.deepEqual(
          await deliver(access, handoff),
          { kind: 'received' },
          'a repeated handoff should be received again',
        )
        assert.equal(await fixture.current(access, handoff), '0')
      },
    },
    {
      name: 'refuses the same revision with other content',
      async run() {
        await deliver(access, sampleAccountHandoff(access.tenant, 'clash'))
        const other = sampleAccountHandoff(access.tenant, 'clash', '0', '99')
        assert.equal(
          (await deliver(access, other)).kind,
          'conflict',
          'the same revision with other content should be a conflict',
        )
      },
    },
    {
      name: 'makes a higher revision current when it arrives after a lower one',
      async run() {
        const low = sampleAccountHandoff(access.tenant, 'rise', '1')
        assert.deepEqual(await deliver(access, low), { kind: 'received' })
        const high = sampleAccountHandoff(access.tenant, 'rise', '3')
        assert.deepEqual(await deliver(access, high), { kind: 'received' })
        assert.equal(
          await fixture.current(access, low),
          '3',
          'a higher revision should become the current revision',
        )
      },
    },
    {
      name: 'keeps the higher revision when a lower one arrives late',
      async run() {
        const high = sampleAccountHandoff(access.tenant, 'order', '2')
        assert.deepEqual(await deliver(access, high), { kind: 'received' })
        const low = sampleAccountHandoff(access.tenant, 'order', '1')
        assert.deepEqual(await deliver(access, low), { kind: 'received' })
        assert.equal(
          await fixture.current(access, high),
          '2',
          'a late lower revision should not replace the higher one',
        )
      },
    },
    {
      name: 'denies a handoff whose call names another tenant and keeps nothing',
      async run() {
        const handoff = sampleAccountHandoff(otherAccess.tenant, 'foreign')
        assert.deepEqual(
          await deliver(access, handoff),
          { kind: 'denied' },
          'a call of another tenant should be denied',
        )
        assert.equal(await fixture.current(otherAccess, handoff), null)
      },
    },
    {
      name: 'refuses a malformed call reference as invalid, not as denied',
      async run() {
        const handoff = sampleAccountHandoff(access.tenant, 'malformed')
        const malformed = { ...handoff, call: 'not-a-reference' as AgentAccountHandoff['call'] }
        assert.equal(
          (await deliver(access, malformed)).kind,
          'invalid',
          'a malformed call reference should be invalid',
        )
      },
    },
    {
      name: 'refuses an account with a malformed revision as invalid',
      async run() {
        const handoff = sampleAccountHandoff(access.tenant, 'bad-revision', 'x')
        assert.equal(
          (await deliver(access, handoff)).kind,
          'invalid',
          'an account with a malformed revision should be invalid',
        )
        assert.equal(await fixture.current(access, handoff), null)
      },
    },
    {
      name: 'refuses an account whose subject is not the call',
      async run() {
        const handoff = sampleAccountHandoff(access.tenant, 'subject')
        const wrong = {
          ...handoff,
          account: {
            ...handoff.account,
            subject: { kind: 'model_call' as const, id: 'mcall_other' },
          },
        }
        assert.equal(
          (await deliver(access, wrong)).kind,
          'invalid',
          'an account of another call should be invalid',
        )
        assert.equal(await fixture.current(access, handoff), null)
      },
    },
  ]
}

/** A fixture of the double, for its own conformance run and for consumer tests. */
export function memoryAgentAccountOutletFixture<P>(
  access: Access<P>,
  otherAccess: Access<P>,
): AgentAccountOutletFixture<P> & Readonly<{ double: MemoryAgentAccountOutlet<P> }> {
  const double = createMemoryAgentAccountOutlet<P>()
  return {
    double,
    outlet: double,
    access,
    otherAccess,
    current: async (who, handoff) =>
      double
        .received(who.tenant)
        .find(kept => kept.call === handoff.call && kept.dispatch === handoff.dispatch)?.account
        .revision ?? null,
  }
}
