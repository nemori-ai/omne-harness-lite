import { expect, it } from 'vitest'
import { canonicalDigest, type CallRecord, type ToolLedgerStore } from '@omne-harness/tool'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { TOOL_FORWARDING_OWNER } from '@omne-harness/tool-host-local'
import {
  currentTargetPolicy,
  withTargetAdmissionPolicy,
} from '../../../src/rows/tool-runtime/target-policy.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { okOf } from '../../entry/support.ts'

it('applies target policy to new admissions while retaining custody of an exactly admitted call', async () => {
  const w = await forwardWorld()
  try {
    const request = w.request('Shell')
    const operation = okOf(decodeToolOperationId('original-admission'), 'operation')
    const input = { principal: w.principal, tenant: w.tenant, call: w.call, operation, request }
    const revision = okOf(decodeToolRevision('1'), 'revision')
    let admitted: CallRecord | null = null
    let reads = 0,
      checks = 0
    const store: ToolLedgerStore = {
      durability: 'none',
      due: async () => ({ kind: 'complete', entries: [] }),
      readRecord: async () => {
        throw new Error('source policy requires a complete call snapshot')
      },
      read: async () => {
        reads++
        return {
          kind: 'complete',
          revision,
          records: admitted === null ? [] : [{ kind: 'call', call: admitted }],
        }
      },
      commit: async () => {
        throw new Error('source policy must not write')
      },
    }
    const guard = withTargetAdmissionPolicy({ verify: async () => ({ kind: 'trusted' }) }, store, {
      qualify: async () => {
        checks++
        return { kind: 'denied', reason: 'current-target-denied' }
      },
    })
    expect(await guard.verify(input)).toEqual({ kind: 'denied', reason: 'current-target-denied' })
    expect(checks).toBe(1)
    admitted = {
      tenant: w.tenant,
      call: w.call,
      admission: operation,
      request,
      initiator: { owner: 'fixture', subject: 'session', revision: '1' },
      state: {
        call: w.call,
        revision,
        foreground: null,
        effect: { kind: 'not-started' },
        execution: { kind: 'not-started' },
        timing: { kind: 'paused', accumulatedMs: '0' },
        queue: { kind: 'none' },
        controls: [],
        delivery: null,
        supplements: [],
        phase: 'accepted',
        wait: { kind: 'none' },
        relation: 'foreground',
        source: {
          owner: 'fixture',
          record: 'call',
          revision: '1',
          digest: canonicalDigest(request),
        },
      },
      preparations: [],
      environment: null,
      start: null,
      startRejection: null,
      execution: null,
    }
    expect(await guard.verify(input)).toEqual({ kind: 'trusted' })
    expect(checks).toBe(1)
    expect(
      await guard.verify({
        ...input,
        request: {
          ...request,
          arguments: { ...request.arguments, effective: '{"command":"changed"}' },
        },
      }),
    ).toMatchObject({ kind: 'forged' })
    expect(
      await guard.verify({
        ...input,
        operation: okOf(decodeToolOperationId('other-admission'), 'operation'),
      }),
    ).toMatchObject({ kind: 'forged' })
    const before = reads
    const forged = withTargetAdmissionPolicy(
      { verify: async () => ({ kind: 'forged', reason: 'source' }) },
      store,
      {
        qualify: async () => {
          throw new Error('must not authorize forged provenance')
        },
      },
    )
    expect(await forged.verify(input)).toEqual({ kind: 'forged', reason: 'source' })
    expect(reads).toBe(before)
  } finally {
    await w.close()
  }
})

it('rechecks residency at start without withdrawing custody or restricting direct resident calls', async () => {
  const w = await forwardWorld()
  try {
    let disclose = true
    let allow = true
    let viewReads = 0
    const policy = currentTargetPolicy({
      authorization: () => ({
        qualify: async () => (allow ? { kind: 'allowed' } : { kind: 'denied', reason: 'revoked' }),
      }),
      view: () => {
        viewReads++
        return disclose ? w.view : undefined
      },
    })
    const direct = {
      principal: w.principal,
      tenant: w.tenant,
      call: w.call,
      request: w.request('ToyEcho'),
    }
    const forwarded = {
      ...direct,
      request: {
        ...direct.request,
        consumer: { ...direct.request.consumer, owner: TOOL_FORWARDING_OWNER },
      },
    }
    expect(await policy.qualify(forwarded)).toEqual({ kind: 'allowed' })
    expect(await policy.qualify(direct)).toEqual({
      kind: 'denied',
      reason: 'nonresident-tools-require-forwarding',
    })
    w.setToyResident(true)
    expect(await policy.qualify(forwarded)).toEqual({
      kind: 'denied',
      reason: 'resident-tools-require-direct-call',
    })
    expect(await policy.qualify(direct)).toEqual({ kind: 'allowed' })
    w.setToyResident(false)
    expect(await policy.qualify(direct)).toMatchObject({ kind: 'denied' })
    expect(
      await policy.qualify({
        ...direct,
        request: {
          ...direct.request,
          consumer: { ...direct.request.consumer, owner: 'trusted-maintainer' },
        },
      }),
    ).toEqual({ kind: 'allowed' })
    disclose = false
    expect(await policy.qualify(direct)).toMatchObject({ kind: 'unavailable' })
    expect(await policy.qualify(forwarded)).toMatchObject({ kind: 'unavailable' })
    allow = false
    const before = viewReads
    expect(await policy.qualify(forwarded)).toEqual({ kind: 'denied', reason: 'revoked' })
    expect(viewReads).toBe(before)
    expect(
      await currentTargetPolicy({ authorization: () => undefined, view: () => w.view }).qualify(
        forwarded,
      ),
    ).toMatchObject({ kind: 'unavailable' })
  } finally {
    await w.close()
  }
})
