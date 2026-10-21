import { describe, expect, it } from 'vitest'
import {
  MODEL_REFERENCE_MAX_LENGTH,
  decodeModelInvocationRef,
  decodeModelOperationRef,
  encodeModelInvocationRef,
  encodeModelOperationRef,
  resolveModelInvocationRef,
  resolveModelOperationRef,
  decodeModelCallId,
  decodeModelOperationId,
  type ModelInvocationParts,
} from '@omne-harness/model-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { tenantA, tenantB, call, operation, must } from './scripted-support.ts'

const parts: ModelInvocationParts = {
  tenant: tenantA,
  call: call('saved'),
  admission: operation('admit-saved'),
}
const reference = must(encodeModelInvocationRef(parts))
const action = { ...parts, operation: operation('ack-saved') }
const operationReference = must(encodeModelOperationRef(action))
const tenantText = tenantCodec.encode(tenantA)
if (!tenantText.ok) throw new Error('minted fixture tenant')
const tuple = ['model-invocation', 1, tenantText.value, parts.call, parts.admission]

describe('saveable Model references', () => {
  it('encodes canonical tuples before any admission and resolves the current tenant object', () => {
    expect(reference).toBe(JSON.stringify(tuple))
    expect(must(decodeModelInvocationRef(JSON.stringify(tuple, null, 1)))).toBe(reference)
    const current = tenantCodec.parse(tenantText.value)
    if (!current.ok) throw new Error('current tenant')
    const resolved = must(resolveModelInvocationRef(reference, current.value))
    expect(resolved).toEqual(parts)
    expect(resolved.tenant).toBe(current.value)
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(must(resolveModelOperationRef(operationReference, current.value))).toEqual({
      ...action,
      tenant: current.value,
    })
    expect(Object.isFrozen(must(resolveModelOperationRef(operationReference, current.value)))).toBe(
      true,
    )
    expect(must(decodeModelOperationRef(operationReference))).toBe(operationReference)
  })

  it('keeps operation and admission distinct, including the admission as an operation', () => {
    expect(must(resolveModelOperationRef(operationReference, tenantA)).operation).toBe(
      action.operation,
    )
    const same = must(encodeModelOperationRef({ ...parts, operation: parts.admission }))
    expect(must(resolveModelOperationRef(same, tenantA)).operation).toBe(parts.admission)
  })

  it.each([
    [null, 'type'],
    [new String(reference), 'type'],
    ['{', 'syntax'],
    ['null', 'shape'],
    [JSON.stringify(['tool-invocation', 1]), 'domain'],
    [JSON.stringify(['model-invocation', 2]), 'version'],
    [JSON.stringify([...tuple, 'extra']), 'shape'],
    [JSON.stringify(tuple.slice(0, 4)), 'shape'],
    [JSON.stringify(['model-invocation', 1, '{}', parts.call, parts.admission]), 'identity'],
    [JSON.stringify(['model-invocation', 1, tenantText.value, 'bad', parts.admission]), 'identity'],
    [JSON.stringify(['model-invocation', 1, tenantText.value, parts.call, 'bad']), 'identity'],
    [
      JSON.stringify(['model-invocation', 1, tenantText.value, parts.call, 'mop_--reserved']),
      'reserved',
    ],
  ])('rejects malformed invocation text %# without coercion', (text, reason) => {
    expect(decodeModelInvocationRef(text)).toEqual({
      failure: { field: 'ModelInvocationRef', reason },
    })
  })

  it('orders domain and version before exact tuple shape', () => {
    expect(decodeModelInvocationRef('["other",3]')).toMatchObject({ failure: { reason: 'domain' } })
    expect(decodeModelInvocationRef('["model-invocation",3]')).toMatchObject({
      failure: { reason: 'version' },
    })
    expect(decodeModelInvocationRef(operationReference)).toMatchObject({
      failure: { reason: 'domain' },
    })
    expect(decodeModelOperationRef(reference)).toMatchObject({ failure: { reason: 'domain' } })
    expect(
      decodeModelOperationRef(
        JSON.stringify([
          'model-operation',
          1,
          tenantText.value,
          parts.call,
          parts.admission,
          'mop_--guard',
        ]),
      ),
    ).toMatchObject({ failure: { reason: 'reserved' } })
  })

  it('bounds text before parsing and preserves the 256-character identity boundary', () => {
    const maxCall = must(decodeModelCallId('mcall_' + 'a'.repeat(250)))
    const maxOperation = must(decodeModelOperationId('mop_' + 'b'.repeat(252)))
    const longest = must(
      encodeModelOperationRef({
        tenant: tenantA,
        call: maxCall,
        admission: maxOperation,
        operation: maxOperation,
      }),
    )
    expect(longest.length).toBeLessThanOrEqual(MODEL_REFERENCE_MAX_LENGTH)
    expect(must(decodeModelOperationRef(longest))).toBe(longest)
    const padded = reference + ' '.repeat(MODEL_REFERENCE_MAX_LENGTH - reference.length)
    expect(must(decodeModelInvocationRef(padded))).toBe(reference)
    expect(decodeModelInvocationRef(padded + ' ')).toMatchObject({ failure: { reason: 'length' } })
    expect(decodeModelInvocationRef(' '.repeat(1025))).toMatchObject({
      failure: { reason: 'length' },
    })
  })

  it('rejects closed-parts violations without executing a getter or toJSON', () => {
    let reads = 0
    const accessor = Object.defineProperty({ ...parts }, 'call', {
      enumerable: true,
      get() {
        reads++
        return parts.call
      },
    })
    const nonEnumerable = Object.defineProperty({ ...parts }, 'call', {
      value: parts.call,
      enumerable: false,
    })
    const inputs = [
      accessor,
      nonEnumerable,
      { ...parts, extra: 1 },
      { ...parts, [Symbol()]: 1 },
      {
        ...parts,
        toJSON() {
          reads++
          return parts
        },
      },
      Object.assign(Object.create({}), parts),
    ]
    for (const input of inputs)
      expect(encodeModelInvocationRef(input)).toMatchObject({ failure: { reason: 'shape' } })
    expect(reads).toBe(0)
    expect(must(encodeModelInvocationRef(Object.assign(Object.create(null), parts)))).toBe(
      reference,
    )
  })

  it('validates one descriptor snapshot when ownKeys changes between observations', () => {
    let observations = 0
    const changing = new Proxy(
      { ...parts, extra: 'untrusted' },
      {
        ownKeys() {
          observations++
          return observations === 1
            ? ['tenant', 'call', 'admission']
            : ['tenant', 'call', 'admission', 'extra']
        },
      },
    )
    expect(must(encodeModelInvocationRef(changing))).toBe(reference)
    expect(observations).toBe(1)
    // A snapshot that actually includes the extra field must be rejected.
    expect(encodeModelInvocationRef(new Proxy({ ...parts, extra: 'untrusted' }, {}))).toMatchObject(
      { failure: { reason: 'shape' } },
    )
  })

  it('returns unreadable for throwing reflection traps', () => {
    for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'] as const) {
      const input = new Proxy(parts, {
        [trap]() {
          throw new Error('private trap detail')
        },
      })
      expect(encodeModelInvocationRef(input)).toEqual({
        failure: { field: 'ModelInvocationRef', reason: 'unreadable' },
      })
    }
  })

  it('checks the current minted tenant before parsing and rejects cross-tenant resolution', () => {
    expect(resolveModelInvocationRef(reference, tenantB)).toEqual({
      failure: { kind: 'foreign-tenant' },
    })
    expect(resolveModelOperationRef(operationReference, tenantB)).toEqual({
      failure: { kind: 'foreign-tenant' },
    })
    expect(resolveModelInvocationRef('malformed', structuredClone(tenantA))).toEqual({
      failure: { kind: 'invalid-tenant' },
    })
    expect(encodeModelInvocationRef({ ...parts, tenant: structuredClone(tenantA) })).toMatchObject({
      failure: { reason: 'identity' },
    })
    expect(resolveModelInvocationRef('malformed', tenantA)).toMatchObject({
      failure: { kind: 'malformed', rejection: { reason: 'syntax' } },
    })
  })
})
