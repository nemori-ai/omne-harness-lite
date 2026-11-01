import type { ModelResultReceiver } from '@omne-harness/model-contract'
import { describe, expectTypeOf, it } from 'vitest'
import type { ModelResultReceiverTable, ModelRuntimeService } from '../src/cordis.ts'

describe('registerResultReceiver types', () => {
  it('takes the owner and a receiver of the principal type and returns a removal function', () => {
    expectTypeOf<ModelRuntimeService<string>['registerResultReceiver']>().toEqualTypeOf<
      (owner: string, receiver: ModelResultReceiver<string>) => () => void
    >()
  })

  it('the table resolves to a receiver or null', () => {
    expectTypeOf<ModelResultReceiverTable<string>['resolve']>().toEqualTypeOf<
      (owner: string) => ModelResultReceiver<string> | null
    >()
  })
})
