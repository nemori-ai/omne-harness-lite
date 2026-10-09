import { narrow, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import { readJsonStrict, type JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  positiveInteger,
  object,
  compareInteger,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StepReceipt } from '@omne-harness-lite/session-runtime'
import type { RuntimeOptions, SessionLifecycleStep } from './runtime-types.ts'
import { readStep } from './coordination-store.ts'
import { runtimeSemantic } from './runtime-values.ts'
import { CoordinationRejection, usableSource } from './coordination-values.ts'
type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
export async function verifyCallPreparation(
  unit: StorageUnit,
  scope: SessionScope,
  step: Preparation,
  current: SourceToken,
  options: RuntimeOptions,
) {
  const row = await unit.query(tx =>
    narrow<{ sr_call_preparation: { session: string; call: string; preparation: string } }>(tx)
      .selectFrom('sr_call_preparation')
      .select('preparation')
      .where('session', '=', scope.session)
      .where('call', '=', step.call)
      .executeTakeFirst(),
  )
  if (!row) throw new CoordinationRejection('retryFromFacts')
  const { permit: _permit, ...data } = step
  const position = preparationPosition(row.preparation, scope, data, options.policy.maxRecordBytes)
  const receipt = await readStep(
    unit,
    scope,
    step.stepKey,
    runtimeSemantic(data, options.policy.maxRecordBytes),
    options,
  )
  checkPreparationReceipt(receipt, step, position)
  usableSource(current, receipt.source)
}
function preparationPosition(
  text: string,
  scope: SessionScope,
  data: Omit<Preparation, 'permit'>,
  limit: number,
): JsonNumber {
  if (Buffer.byteLength(text) > limit) throw new StorageDefect('oversized call preparation')
  const actual = readJsonStrict(text)
  if ('failed' in actual || !object(actual.ok) || !positiveInteger(actual.ok.position))
    throw new StorageDefect('corrupt call preparation')
  const { position, ...original } = actual.ok
  if (runtimeSemantic(original, limit) !== runtimeSemantic({ ...scope, ...data }, limit))
    throw new CoordinationRejection('retryFromFacts')
  return position
}
function checkPreparationReceipt(
  receipt: StepReceipt | undefined,
  step: Preparation,
  position: JsonNumber,
): asserts receipt is StepReceipt {
  if (
    !receipt ||
    receipt.step !== 'prepareCall' ||
    receipt.run !== step.run ||
    receipt.attempt === null ||
    compareInteger(receipt.attempt, step.attempt) !== 0 ||
    compareInteger(receipt.position, position) !== 0
  )
    throw new StorageDefect('call preparation receipt mismatch')
}
