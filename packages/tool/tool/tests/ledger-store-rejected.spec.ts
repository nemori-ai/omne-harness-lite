// SPEC 11: a commit that the ledger store rejects can never be accepted. The ledger answers the
// definite failure `invalid` (`field: storage`, the store's reason), at once: it neither re-reads
// and decides again, as it does after a revision conflict, nor spends `ledgerCommitAttempts`.
import { describe, expect, it } from 'vitest'
import type { LedgerCommitInput } from '@omne-harness/tool'
import {
  admission,
  adoption,
  callId,
  failure,
  fixedOf,
  fixedRequestForNamedSourceGuard,
  ok,
  request,
  tenantA,
  type Block,
} from './runtime-values.ts'
import { admitCall, losingCommits, startHarness, writeContext } from './start-values.ts'

const rejected = { kind: 'invalid', field: 'storage', reason: 'command_limit' } as const

/** A harness whose store rejects up to `times` commits matching `matches`, counting each one. */
function rejecting(matches: (input: LedgerCommitInput<Block>) => boolean, times: number) {
  const seen = { rejectable: 0 }
  let armed = false
  const harness = startHarness({
    ledgerCommitAttempts: times,
    store: memory =>
      losingCommits(
        memory,
        input => {
          if (!armed || !matches(input)) return false
          seen.rejectable += 1
          return true
        },
        'rejected',
        times,
      ),
  })
  return {
    harness,
    seen,
    arm: () => {
      armed = true
    },
  }
}

describe('11 a commit the ledger store rejects', () => {
  it('11 rejected: an admission answers invalid storage after one commit, and nothing is admitted', async () => {
    const { harness, seen, arm } = rejecting(input => input.domain.kind === 'call', 3)
    arm()
    const fixed = fixedRequestForNamedSourceGuard(request())
    expect(await harness.ledger.admissions.admit(admission('c1', 'op-c1', fixed))).toEqual({
      failure: rejected,
    })
    expect(seen.rejectable).toBe(1)
    expect(
      await harness.memory.read({ kind: 'call', tenant: tenantA, call: callId('c1') }),
    ).toEqual({ kind: 'complete', revision: '0', records: [] })
  })

  it('11 rejected: a queue-domain step answers invalid storage after one commit', async () => {
    const { harness, seen, arm } = rejecting(input => input.domain.kind === 'queue', 3)
    await admitCall(harness, 'c1')
    const preparation = ok(
      await harness.commands.planPreparation({
        ...(await writeContext(harness, 'c1', 'c1/plan')),
        request: fixedOf(harness.internalRequests, 'c1'),
        purpose: 'initial',
        environmentAdoption: adoption('environment'),
      }),
    )
    ok(
      await harness.commands.prepared({
        ...(await writeContext(harness, 'c1', 'c1/prepared')),
        preparation,
        resources: { owner: 'o', record: 'env', revision: '1', digest: 'd' },
      }),
    )
    arm()
    const before = await harness.state('c1')
    expect(
      failure(await harness.commands.enqueue(await writeContext(harness, 'c1', 'c1/enqueue'))),
    ).toEqual(rejected)
    expect(seen.rejectable).toBe(1)
    expect(await harness.state('c1')).toEqual(before)
  })
})
