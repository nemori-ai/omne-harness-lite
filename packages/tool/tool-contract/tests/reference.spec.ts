import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  TOOL_REFERENCE_MAX_LENGTH,
  decodeToolInvocationRef,
  decodeToolOperationRef,
  encodeToolInvocationRef,
  encodeToolOperationRef,
  readToolInvocationRef,
  readToolOperationRef,
  resolveToolInvocationRef,
  resolveToolOperationRef,
  type ToolCallId,
  type ToolInvocationRef,
  type ToolOperationId,
  type ToolOperationRef,
} from '@omne-harness/tool-contract'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}

const tenantA = tenant(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)
const tenantB = tenant(
  parsed(organizationCodec.parse(`org_${'2'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'3'.repeat(26)}`)),
)

/** The canonical tenant text of `tenantA`, as legal-identity's tenantCodec writes it. */
const tenantTextA = `{"organization":"org_${'0'.repeat(26)}","account":"acc_${'1'.repeat(26)}"}`

const call = 'call_01J9' as ToolCallId
const admission = 'op_01J9-admit' as ToolOperationId
const operation = 'op_01J9-release' as ToolOperationId

const partsA = { tenant: tenantA, call, admission }
const operationPartsA = { ...partsA, operation }

const invocationRef: ToolInvocationRef = (() => {
  const encoded = encodeToolInvocationRef(partsA)
  if ('failure' in encoded) throw new Error('fixture reference does not encode')
  return encoded.ok
})()
const operationRef: ToolOperationRef = (() => {
  const encoded = encodeToolOperationRef(operationPartsA)
  if ('failure' in encoded) throw new Error('fixture reference does not encode')
  return encoded.ok
})()

describe('invocation reference codec', () => {
  it('encodes the versioned array form and decodes it back to the canonical text', () => {
    expect(invocationRef).toBe(JSON.stringify(['tool-invocation', 1, tenantTextA, call, admission]))
    expect(decodeToolInvocationRef(invocationRef)).toEqual({ ok: invocationRef })
    // A non-canonical spacing and member order of the same structure decodes to the same value.
    const reordered = `{"account":"acc_${'1'.repeat(26)}", "organization":"org_${'0'.repeat(26)}"}`
    const spaced = `[ "tool-invocation", 1, ${JSON.stringify(reordered)}, "${call}", "${admission}" ]`
    expect(decodeToolInvocationRef(spaced)).toEqual({ ok: invocationRef })
  })

  it('rejects malformed values with the closed reasons, without throwing', () => {
    const failure = (reason: string) => ({
      failure: { field: 'ToolInvocationRef', reason },
    })
    expect(decodeToolInvocationRef(7)).toEqual(failure('type'))
    expect(decodeToolInvocationRef(null)).toEqual(failure('type'))
    expect(decodeToolInvocationRef('not json')).toEqual(failure('type'))
    expect(decodeToolInvocationRef('{"a":1}')).toEqual(failure('type'))
    // The operation marker in the invocation decode is another kind, not another version.
    expect(decodeToolInvocationRef(operationRef)).toEqual(failure('type'))
    expect(decodeToolInvocationRef('["tool-invocation",2,"t","c","a"]')).toEqual(failure('version'))
    expect(decodeToolInvocationRef('["tool-invocation","1","t","c","a"]')).toEqual(
      failure('version'),
    )
    expect(decodeToolInvocationRef('["tool-invocation",1,"t","c"]')).toEqual(failure('shape'))
    expect(decodeToolInvocationRef('["tool-invocation",1,"t","c","a","x"]')).toEqual(
      failure('shape'),
    )
    // A tenant text that is not a legal-identity tenant is a shape failure.
    const badTenant = JSON.stringify([
      'tool-invocation',
      1,
      '{"organization":"o"}',
      call,
      admission,
    ])
    expect(decodeToolInvocationRef(badTenant)).toEqual(failure('shape'))
    // An identity element that is not identity text is a shape failure.
    const badIdentity = JSON.stringify(['tool-invocation', 1, tenantTextA, 'has space', admission])
    expect(decodeToolInvocationRef(badIdentity)).toEqual(failure('shape'))
    expect(decodeToolInvocationRef('a'.repeat(TOOL_REFERENCE_MAX_LENGTH + 1))).toEqual(
      failure('length'),
    )
  })

  it('holds the worst escaped parts exactly at the documented limit', () => {
    // The longest identity is 256 characters; the worst JSON escaping doubles each.
    const worst = {
      tenant: tenantA,
      call: '"'.repeat(256) as ToolCallId,
      admission: '"'.repeat(256) as ToolOperationId,
      operation: '"'.repeat(256) as ToolOperationId,
    }
    const invocation = encodeToolInvocationRef(worst)
    if ('failure' in invocation) throw new Error('the longest parts must encode')
    expect(invocation.ok.length).toBe(1154)
    const encoded = encodeToolOperationRef(worst)
    if ('failure' in encoded) throw new Error('the longest parts must encode')
    expect(encoded.ok.length).toBe(TOOL_REFERENCE_MAX_LENGTH)
    expect(decodeToolOperationRef(encoded.ok)).toEqual({ ok: encoded.ok })
  })

  it('rejects a tenant that legal-identity did not mint', () => {
    const forged = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: `org_${'0'.repeat(26)}` },
      account: { name: 'AccountId', text: `acc_${'1'.repeat(26)}` },
    } as TenantId
    expect(encodeToolInvocationRef({ tenant: forged, call, admission })).toEqual({
      failure: { field: 'ToolInvocationRef', reason: 'type' },
    })
    expect(encodeToolOperationRef({ tenant: forged, call, admission, operation })).toEqual({
      failure: { field: 'ToolOperationRef', reason: 'type' },
    })
  })
})

describe('operation reference codec', () => {
  it('round-trips and projects the operation', () => {
    expect(decodeToolOperationRef(operationRef)).toEqual({ ok: operationRef })
    expect(readToolOperationRef(operationRef)).toEqual({
      tenant: tenantA,
      call,
      admission,
      operation,
    })
    // The invocation form is another kind under the operation decode.
    expect(decodeToolOperationRef(invocationRef)).toEqual({
      failure: { field: 'ToolOperationRef', reason: 'type' },
    })
  })
})

describe('reference resolution against the presented tenant', () => {
  it('resolves the parts for the tenant of the reference', () => {
    expect(resolveToolInvocationRef(invocationRef, tenantA)).toEqual({
      ok: { tenant: tenantA, call, admission },
    })
    expect(resolveToolOperationRef(operationRef, tenantA)).toEqual({
      ok: { tenant: tenantA, call, admission, operation },
    })
  })

  it('answers foreign-tenant for another minted tenant or a presented shape', () => {
    expect(resolveToolInvocationRef(invocationRef, tenantB)).toEqual({
      failure: { kind: 'foreign-tenant' },
    })
    expect(resolveToolOperationRef(operationRef, tenantB)).toEqual({
      failure: { kind: 'foreign-tenant' },
    })
    // A presented object with the tenant shape that legal-identity never minted is foreign too.
    const presented = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: `org_${'0'.repeat(26)}` },
      account: { name: 'AccountId', text: `acc_${'1'.repeat(26)}` },
    } as TenantId
    expect(resolveToolInvocationRef(invocationRef, presented)).toEqual({
      failure: { kind: 'foreign-tenant' },
    })
  })

  it('answers malformed with the closed rejection for a bad text', () => {
    expect(resolveToolInvocationRef('[]', tenantA)).toEqual({
      failure: {
        kind: 'malformed',
        rejection: { field: 'ToolInvocationRef', reason: 'type' },
      },
    })
    expect(resolveToolOperationRef(invocationRef, tenantA)).toEqual({
      failure: {
        kind: 'malformed',
        rejection: { field: 'ToolOperationRef', reason: 'type' },
      },
    })
  })
})

it('reads the parts of a branded invocation reference', () => {
  expect(readToolInvocationRef(invocationRef)).toEqual({ tenant: tenantA, call, admission })
})
