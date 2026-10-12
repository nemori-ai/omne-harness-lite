import { expectTypeOf } from 'vitest'
import type {
  SettlementCoordinator,
  SettlementHandle,
  SettlementRequest,
  SettlementStagedBatch,
  SettlementStaging,
  SettlementTask,
  SettlementResult,
  ModelLogSettlementTarget,
  ModelLogSettlementCurrent,
  SettlementCoordinatorBinding,
  SettlementCoordinatorFactory,
} from '../src/index.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { SettlementCoordinatorFactoryService } from '../src/cordis.ts'

expectTypeOf<ReturnType<SettlementCoordinator['settle']>>().toEqualTypeOf<SettlementHandle>()
expectTypeOf<SettlementHandle>().toEqualTypeOf<SettlementTask<SettlementResult>>()
expectTypeOf<SettlementRequest['target']>().toEqualTypeOf<ModelLogSettlementTarget>()
expectTypeOf<SettlementRequest['current']>().toEqualTypeOf<ModelLogSettlementCurrent | null>()
expectTypeOf<Parameters<SettlementStaging['hold']>[0]>().toEqualTypeOf<SettlementStagedBatch>()
expectTypeOf<ReturnType<SettlementCoordinator['close']>>().toEqualTypeOf<Promise<void>>()

declare const completion: Promise<SettlementResult>
// @ts-expect-error A result promise alone does not carry stopping responsibility.
const missingStop: SettlementHandle = { completion }
void missingStop

declare const staged: SettlementStagedBatch
// @ts-expect-error A held flag alone does not retain the exact batch and condition.
const incompleteBatch: SettlementStagedBatch = { target: staged.target, current: staged.current }
void incompleteBatch

expectTypeOf<keyof SettlementCoordinatorBinding>().toEqualTypeOf<'binding' | 'owner' | 'run'>()
expectTypeOf<
  ReturnType<SettlementCoordinatorFactory['create']>
>().toEqualTypeOf<SettlementCoordinator>()
expectTypeOf<SettlementCoordinatorFactoryService>().toExtend<SettlementCoordinatorFactory>()
expectTypeOf<
  Context['modelSettlementFactory']
>().toEqualTypeOf<SettlementCoordinatorFactoryService>()
declare const factory: SettlementCoordinatorFactory
declare const missingOwner: Omit<SettlementCoordinatorBinding, 'owner'>
// @ts-expect-error A binding without its actual settlement owner is not constructible.
factory.create(missingOwner)
