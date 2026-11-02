// The status code map covers every public outcome of the binding page, one code each.
import { describe, expect, it } from 'vitest'
import { STATUS_BY_OUTCOME } from '../src/status.ts'

const BINDING_TABLE: Readonly<Record<string, number>> = {
  succeeded: 200,
  'no-change': 200,
  'not-committed': 200,
  'need-decision': 202,
  'protocol-rejected': 400,
  invalid: 422,
  'uniform-auth-failure': 401,
  denied: 403,
  'not-loginable': 403,
  'not-visible': 404,
  'not-found': 404,
  conflict: 409,
  archived: 409,
  frozen: 409,
  unsupported: 501,
  'stage-not-provided': 501,
  'basis-unavailable': 503,
  unknown: 500,
}

describe('status map', () => {
  it('matches the binding page table exactly', () => {
    expect(Object.keys(BINDING_TABLE).length).toBe(18)
    expect({ ...STATUS_BY_OUTCOME }).toEqual(BINDING_TABLE)
  })
})
