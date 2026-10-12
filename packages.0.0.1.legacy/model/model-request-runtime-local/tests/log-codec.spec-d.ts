import { expectTypeOf, test } from 'vitest'
import {
  encodeModelLogKey,
  captureModelLogValue,
  prepareModelLogEntry,
  inspectSettlementMembers,
  type ModelLogKey,
  type PrepareModelLogEntryInput,
  type SettlementMembersResult,
} from '@omne-harness-lite/model-request-runtime'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log'

test('D088 public root types keep explicit identity, reception and write/read boundaries', () => {
  expectTypeOf(encodeModelLogKey).parameter(0).toEqualTypeOf<ModelLogKey>()
  expectTypeOf(prepareModelLogEntry).parameter(0).toEqualTypeOf<PrepareModelLogEntryInput>()
  expectTypeOf(inspectSettlementMembers).returns.toEqualTypeOf<SettlementMembersResult>()
  const accepted = captureModelLogValue({
    category: 'message',
    input: { kind: 'text', text: '{}' },
  })
  if ('ok' in accepted) expectTypeOf(accepted.ok.value).not.toBeAny()
  // @ts-expect-error Text/value modes are explicit and cannot be omitted.
  captureModelLogValue({ category: 'message', input: '{}' })
  // @ts-expect-error dispatch identities require the call and exact number.
  encodeModelLogKey({ kind: 'dispatch', dispatch: 1 })
  expectTypeOf<OwnedLogEntry>().not.toHaveProperty('position')
})
