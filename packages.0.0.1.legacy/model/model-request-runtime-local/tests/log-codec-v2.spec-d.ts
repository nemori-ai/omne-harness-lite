import { expectTypeOf, test } from 'vitest'
import * as codec from '@omne-harness-lite/model-request-runtime'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log'

test('D094 v2 exposes fixed pure functions with exact public input and result types', () => {
  expectTypeOf<typeof codec.modelLogFormat>().toEqualTypeOf<'mrr/3'>()
  expectTypeOf(codec.prepareModelLogEntry)
    .parameter(0)
    .toEqualTypeOf<codec.PrepareModelLogEntryInput>()
  expectTypeOf(
    codec.inspectSettlementMembers,
  ).returns.toEqualTypeOf<codec.SettlementMembersResult>()
  expectTypeOf(codec).not.toHaveProperty('createEntryCodec')
  expectTypeOf(codec).not.toHaveProperty('createValueCodec')
  expectTypeOf(codec).not.toHaveProperty('createSettlementCodec')
  const value = codec.captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: {} },
  })
  if ('ok' in value) expectTypeOf(value.ok.value).not.toBeAny()
  expectTypeOf<OwnedLogEntry>().not.toHaveProperty('position')
  codec.captureModelLogValue(
    { category: 'response', input: { kind: 'value', value: {} } },
    // @ts-expect-error There is no caller-controlled representation or judge argument.
    { format: 'anything' },
  )
})
