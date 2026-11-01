import { expectTypeOf, test } from 'vitest'
import type { OperatorOp, RowId, TreeRow } from '../src/index.ts'

test('RowId is a brand: only an explicit cast produces one', () => {
  const id = 'a' as RowId
  expectTypeOf(id).toExtend<string>()
  expectTypeOf<TreeRow['id']>().toEqualTypeOf<RowId>()

  // @ts-expect-error a plain string is not a RowId
  const plain: RowId = 'a'
  void plain
})

test('OperatorOp is a discriminated union on kind', () => {
  const id = 'a' as RowId
  const narrow = (op: OperatorOp) => {
    if (op.kind === 'insert') {
      expectTypeOf(op.after).toEqualTypeOf<RowId>()
    }
  }
  void narrow
  const op: OperatorOp = { kind: 'disable', id }
  void op
  expectTypeOf<OperatorOp['kind']>().toEqualTypeOf<'replace' | 'disable' | 'insert'>()

  // @ts-expect-error disable carries no config
  const bad: OperatorOp = { kind: 'disable', id, config: {} }
  void bad
})
