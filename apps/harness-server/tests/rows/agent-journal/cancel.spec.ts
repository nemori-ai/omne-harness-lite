// @module-tag slow
// The cancellation installation of the `agent-journal` row (R2-D35, KL-68): the release row hands the
// governance installation of `src/entry/cancellation-installation.ts` to the Journal of every session,
// so cancelling a running Run ends it `cancelled`; a row made without the installation answers
// `unavailable`; another tenant cannot cancel the Run. The judgment itself is pure and is tested on
// crafted inputs below.
import { afterEach, describe, expect, it } from 'vitest'
import type { CancellationJudgmentInput } from '@omne-harness/agent-contract'
import { memoryAccess, memoryOtherAccess } from '@omne-harness/session-contract/testing'
import {
  RELEASE_CANCELLATION_IMPLEMENTATION,
  RELEASE_CANCELLATION_POLICY,
  createReleaseCancellationPolicy,
  releaseCancellationPolicyInstallation,
} from '../../../src/entry/cancellation-installation.ts'
import {
  cancelTree,
  endCancelled,
  establishAs,
  load,
  operation,
  requestCancel,
  type CancelTree,
} from './cancel-scene.ts'

const installation = releaseCancellationPolicyInstallation.record
const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(cancellation: 'release' | 'absent'): Promise<CancelTree> {
  const scene = await cancelTree(cancellation)
  release.push(() => scene.release())
  release.push(() => scene.tree.dispose())
  return scene
}

describe('the agent-journal row: cancelling a running Run', () => {
  it('the release row ends a running Run cancelled', { timeout: 60_000 }, async () => {
    const { journal, openRun } = await start('release')
    const run = await openRun(memoryAccess('tester', 'cancel-run'))
    expect((await load(journal, run)).state.kind).toBe('advancing')
    expect('ok' in (await requestCancel(journal, run))).toBe(true)
    const ended = await endCancelled(journal, run, installation)
    expect(ended).toMatchObject({ ok: { kind: 'ended' } })
    const after = await load(journal, run)
    expect(after.state).toMatchObject({ kind: 'ended' })
    expect(JSON.stringify(after.state)).toContain('cancelled')
  })

  it(
    'the row made without the installation answers unavailable and the Run stays unended',
    { timeout: 60_000 },
    async () => {
      const { journal, openRun } = await start('absent')
      const run = await openRun(memoryAccess('tester', 'cancel-absent'))
      expect('ok' in (await requestCancel(journal, run))).toBe(true)
      expect(await endCancelled(journal, run, installation)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
      expect((await load(journal, run)).state.kind).not.toBe('ended')
    },
  )

  it(
    'another tenant cannot cancel the Run, and the Run is not changed by the attempt',
    { timeout: 60_000 },
    async () => {
      const { journal, openRun } = await start('release')
      const run = await openRun(memoryAccess('tester', 'cancel-owner'))
      // The intruder is a registered tenant with a Run of its own, so only the ownership refuses it.
      const intruder = memoryOtherAccess('intruder', 'cancel-intruder')
      await openRun(intruder)
      expect('ok' in (await requestCancel(journal, run))).toBe(true)
      const before = await load(journal, run)

      const control = await requestCancel(
        journal,
        { access: intruder, execution: run.execution },
        operation('foreign-control'),
      )
      expect(control).toMatchObject({ failure: { kind: 'denied' } })
      const establish = await establishAs(journal, run, intruder, installation)
      expect(establish).toMatchObject({ failure: { kind: 'denied' } })
      const after = await load(journal, run)
      expect(after.revision).toEqual(before.revision)
      expect(after.settlement.candidate).toBeNull()

      // The refusals came from the tenant: the owner's own cancel of the same Run still ends it.
      expect(await endCancelled(journal, run, installation)).toMatchObject({
        ok: { kind: 'ended' },
      })
    },
  )
})

const evidence = (record: string) => ({ owner: 't', record, revision: '1', digest: `t:${record}` })
const continuation = {
  kind: 'original-operation-query',
  request: { kind: 'parameters', value: {} },
  owner: 'journal',
  custodian: null,
  purpose: 'query',
}

/** A judgment input with an effective cancel and no obligation; tests change one field. */
function inputOf(overrides: Record<string, unknown> = {}): CancellationJudgmentInput {
  return {
    tenant: 'tenant',
    execution: 'execution',
    candidate: { candidate: 'cand', conclusion: { kind: 'cancelled' } },
    control: {
      operation: 'control',
      command: { kind: 'cancel' },
      stages: {
        accepted: { source: evidence('accepted') },
        'intent-established': { state: 'reached', source: evidence('intent') },
      },
    },
    route: {
      kind: 'cancellation',
      record: evidence('route'),
      candidate: 'cand',
      control: 'control',
    },
    readRevision: 7,
    coverage: { readRevision: 7, inputWatermark: evidence('watermark') },
    items: [],
    participants: { kind: 'standalone', basis: evidence('basis') },
    ...overrides,
  } as unknown as CancellationJudgmentInput
}

const item = (disposition: unknown) => ({
  kind: 'call',
  key: 'call-1',
  source: evidence('call-1'),
  disposition,
})

describe('the release cancellation judgment', () => {
  const policy = createReleaseCancellationPolicy()

  it('names the exact adoptions of the installation', () => {
    expect(policy.policy).toEqual(RELEASE_CANCELLATION_POLICY)
    expect(policy.implementation).toEqual(RELEASE_CANCELLATION_IMPLEMENTATION)
    expect(releaseCancellationPolicyInstallation.policy).toEqual(RELEASE_CANCELLATION_POLICY)
    expect(releaseCancellationPolicyInstallation.implementation).toEqual(
      RELEASE_CANCELLATION_IMPLEMENTATION,
    )
  })

  it('allows an effective cancel whose obligations are settled', () => {
    const decision = policy.judge(
      inputOf({ items: [item({ kind: 'settled', completion: evidence('done') })] }),
    )
    expect(decision.kind).toBe('allowed')
  })

  it('blocks on a pending obligation', () => {
    const decision = policy.judge(
      inputOf({
        items: [item({ kind: 'pending', reason: 'call-custody', required: continuation })],
      }),
    )
    expect(decision).toMatchObject({
      kind: 'blocked',
      reasons: [{ category: 'operations', key: 'call-1' }],
    })
  })

  it('answers unknown for an unknown obligation, keeping the known blocks', () => {
    const question = {
      owner: 'tool',
      key: 'call-1',
      position: evidence('q'),
      reason: 'original-operation-unknown',
    }
    const decision = policy.judge(
      inputOf({
        items: [
          item({ kind: 'unknown', question, required: continuation }),
          {
            ...item({ kind: 'pending', reason: 'call-custody', required: continuation }),
            key: 'call-2',
          },
        ],
      }),
    )
    expect(decision).toMatchObject({
      kind: 'unknown',
      questions: [question],
      knownBlocked: [{ key: 'call-2' }],
    })
  })

  it('blocks when the intent of the cancel is not reached', () => {
    const base = inputOf()
    const decision = policy.judge(
      inputOf({
        control: {
          ...base.control,
          stages: { accepted: { source: evidence('accepted') } },
        },
      }),
    )
    expect(decision).toMatchObject({ kind: 'blocked', reasons: [{ reason: 'cancel-intent' }] })
  })

  it('blocks when the candidate does not conclude cancelled', () => {
    const decision = policy.judge(
      inputOf({ candidate: { candidate: 'cand', conclusion: { kind: 'complete' } } }),
    )
    expect(decision.kind).toBe('blocked')
  })

  it('answers unknown when the coverage was read at another revision', () => {
    const decision = policy.judge(
      inputOf({ coverage: { readRevision: 6, inputWatermark: evidence('w') } }),
    )
    expect(decision).toMatchObject({
      kind: 'unknown',
      questions: [{ reason: 'coverage-incomplete' }],
    })
  })

  it('does not allow while a coordinated participant is blocked or its condition unknown', () => {
    const participant = (condition: unknown) => ({
      kind: 'coordinated',
      association: evidence('association'),
      participants: [
        {
          owner: 'session',
          protocol: {},
          source: evidence('p'),
          version: evidence('v'),
          condition,
          purpose: evidence('u'),
        },
      ],
    })
    expect(
      policy.judge(
        inputOf({
          participants: participant({ kind: 'blocked', category: 'inputs', source: evidence('b') }),
        }),
      ).kind,
    ).toBe('blocked')
    expect(policy.judge(inputOf({ participants: participant({ kind: 'unknown' }) })).kind).toBe(
      'unknown',
    )
    expect(policy.judge(inputOf({ participants: participant({ kind: 'ready' }) })).kind).toBe(
      'allowed',
    )
  })
})
