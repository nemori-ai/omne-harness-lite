import { describe, expectTypeOf, it } from 'vitest'
import type { ReferenceViolationKind, Storage, WriteTx } from '../src/index.ts'

describe('storage 协议类型', () => {
  it('引用违反恰两向', () => {
    expectTypeOf<ReferenceViolationKind>().toEqualTypeOf<'delete-restricted' | 'missing-target'>()
  })
  it('协议面恰 read/write；WriteTx 多 lockRow/lockSentinel', () => {
    expectTypeOf<keyof Storage>().toEqualTypeOf<'read' | 'write'>()
    expectTypeOf<keyof WriteTx>().toEqualTypeOf<'db' | 'lockRow' | 'lockSentinel'>()
  })
})
