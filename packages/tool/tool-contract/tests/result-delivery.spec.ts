// The pure relation table of judgeToolDelivery (SPEC「结果推送与保存」): the first failure in the
// order of the table, and the input itself on success.
import { describe, expect, it } from 'vitest'
import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  judgeToolDelivery,
  type ToolDelivery,
  type ToolInvocationRef,
} from '@omne-harness/tool-contract'
import { decodeToolDeliveryId, decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { evidence, result, text } from './tool-values.ts'

function minted<T>(decoded: { ok: T } | { failure: unknown }): T {
  if ('failure' in decoded) throw new Error('illegal test value')
  return decoded.ok
}

const own = (): TenantId =>
  testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
const other = (): TenantId =>
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')
const call = minted(decodeToolCallId('call-1'))

function reference(tenant: TenantId): ToolInvocationRef {
  return minted(
    encodeToolInvocationRef({ tenant, call, admission: minted(decodeToolOperationId('admit-1')) }),
  )
}

function account(id: string, revision: string): CallAccount {
  return {
    subject: { kind: 'tool_execution', id },
    usage: [],
    cost: [],
    trimmed: { state: 'known', lexeme: '0', unit: 'token' },
    place: 'test',
    duration: 'PT1S',
    receipt: 'received',
    revision,
  }
}

const consumer = { owner: 'receiver', work: 'work-1', position: 'position-1', purpose: 'result' }

function resultDelivery(
  tenant: TenantId,
  owner = 'call-1',
): Extract<ToolDelivery<ContentBlock>, { kind: 'result' }> {
  return {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference: reference(tenant),
      result: minted(decodeToolResultVersion('result-1')),
    },
    consumer,
    delivery: minted(decodeToolDeliveryId('delivery-1')),
    relation: 'original',
    terminal: { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'not-occurred', evidence: evidence('effect') },
    source: evidence('source'),
    value: result([text('block-1', 'done')]),
    account: account(owner, '1'),
  }
}

function accountDelivery(
  keyRevision: string,
  accountRevision: string,
): Extract<ToolDelivery<ContentBlock>, { kind: 'account' }> {
  return {
    kind: 'account',
    key: {
      kind: 'account',
      producer: 'tool',
      reference: reference(own()),
      event: 'meter-1',
      revision: keyRevision,
    },
    consumer,
    account: account('call-1', accountRevision),
  }
}

describe('judgeToolDelivery', () => {
  it('returns the input itself for a legal result and a legal account', () => {
    const delivery = resultDelivery(own())
    expect(judgeToolDelivery({ tenant: own(), delivery })).toEqual({ ok: delivery })
    const judged = judgeToolDelivery({ tenant: own(), delivery })
    expect('ok' in judged && judged.ok).toBe(delivery)
    const accountPush = accountDelivery('2', '2')
    expect(judgeToolDelivery({ tenant: own(), delivery: accountPush })).toEqual({ ok: accountPush })
  })

  it('accepts a result whose account is not reported yet', () => {
    const delivery = { ...resultDelivery(own()), account: null }
    expect(judgeToolDelivery({ tenant: own(), delivery })).toEqual({ ok: delivery })
  })

  it('rejects a tenant that is not minted before it reads the reference', () => {
    const forged = { ...own() } as TenantId
    const delivery = {
      ...resultDelivery(own()),
      key: { ...resultDelivery(own()).key, reference: 'x' as ToolInvocationRef },
    } as ToolDelivery<ContentBlock>
    expect(judgeToolDelivery({ tenant: forged, delivery })).toEqual({
      failure: { field: 'tenant', reason: 'identity' },
    })
  })

  it('rejects a malformed reference and a reference of another tenant', () => {
    const base = resultDelivery(own())
    const malformed = {
      ...base,
      key: { ...base.key, reference: '["tool-invocation",2]' as ToolInvocationRef },
    } as ToolDelivery<ContentBlock>
    expect(judgeToolDelivery({ tenant: own(), delivery: malformed })).toEqual({
      failure: { field: 'key.reference', reason: 'reference-malformed' },
    })
    expect(judgeToolDelivery({ tenant: own(), delivery: resultDelivery(other()) })).toEqual({
      failure: { field: 'key.reference', reason: 'foreign-tenant' },
    })
  })

  it('rejects an account whose key names another revision before it reads the subject', () => {
    const mismatch = {
      ...accountDelivery('2', '3'),
      account: account('call-other', '3'),
    } as ToolDelivery<ContentBlock>
    expect(judgeToolDelivery({ tenant: own(), delivery: mismatch })).toEqual({
      failure: { field: 'key.revision', reason: 'revision-mismatch' },
    })
  })

  it('rejects an account of another call, on both branches', () => {
    expect(
      judgeToolDelivery({ tenant: own(), delivery: resultDelivery(own(), 'call-other') }),
    ).toEqual({
      failure: { field: 'account.subject', reason: 'call-mismatch' },
    })
    const modelAccount = {
      ...accountDelivery('2', '2'),
      account: {
        ...account('call-1', '2'),
        subject: { kind: 'model_call' as const, id: 'call-1' },
      },
    } as ToolDelivery<ContentBlock>
    expect(judgeToolDelivery({ tenant: own(), delivery: modelAccount })).toEqual({
      failure: { field: 'account.subject', reason: 'call-mismatch' },
    })
  })
})
