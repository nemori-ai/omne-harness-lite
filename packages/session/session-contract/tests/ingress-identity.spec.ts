// The canonical identity of the ingress families (r2.2 section 4.3, ID-01).
import { describe, expect, it } from 'vitest'
import { INGRESS_FAMILIES, deriveIngressOperation } from '@omne-harness/session-contract'

describe('deriveIngressOperation', () => {
  it('does not collide when field values contain separators, quotes or newlines', () => {
    const family = INGRESS_FAMILIES.control
    const ids = [
      deriveIngressOperation(family, ['l', 'a', 'b:c', 'x']),
      deriveIngressOperation(family, ['l', 'a:b', 'c', 'x']),
      deriveIngressOperation(family, ['l', 'a', 'b', 'c:x']),
      deriveIngressOperation(family, ['l', 'a"', 'b', 'x']),
      deriveIngressOperation(family, ['l', 'a', '"b', 'x']),
      deriveIngressOperation(family, ['l', 'a\n', 'b', 'x']),
      deriveIngressOperation(family, ['l', 'a', '\nb', 'x']),
      deriveIngressOperation(family, ['l,a', 'b', 'x']),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the three families disjoint for the same fields', () => {
    const fields = ['login', 'tenant', 'session', 'id']
    const ids = Object.values(INGRESS_FAMILIES).map(family =>
      deriveIngressOperation(family, fields),
    )
    expect(new Set(ids).size).toBe(3)
  })

  it('is stable and fixed to the three family texts', () => {
    const a = deriveIngressOperation(INGRESS_FAMILIES.control, ['l', 't', 's', 'c'])
    expect(a).toBe(deriveIngressOperation(INGRESS_FAMILIES.control, ['l', 't', 's', 'c']))
    expect(INGRESS_FAMILIES).toEqual({
      control: 'session-public/1-control',
      accept: 'session-public/1-accept',
      create: 'session-public/1-create',
    })
    expect(a.startsWith('sop_')).toBe(true)
  })
})
