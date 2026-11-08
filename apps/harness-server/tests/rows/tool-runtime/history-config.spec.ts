import { expect, it } from 'vitest'
import { toolHistoryConfigSchema } from '../../../src/rows/tool-runtime/history-config.ts'
import { fixtureTenant } from '../../entry/support.ts'
import { tenantCodec } from '@omne-harness/legal-identity'

it('requires an explicit mode and rejects unknown encodings and duplicate call addresses', () => {
  const tenant = tenantCodec.encode(fixtureTenant('a'))
  if (!tenant.ok) throw new Error('invalid fixture tenant')
  const entry = { tenant: tenant.value, call: 'call_1', values: [] }
  expect(toolHistoryConfigSchema.safeParse({ interpretations: [] }).success).toBe(false)
  expect(
    toolHistoryConfigSchema.safeParse({ mode: 'upgrade', interpretations: [entry, entry] }).success,
  ).toBe(false)
  expect(
    toolHistoryConfigSchema.safeParse({
      mode: 'upgrade',
      interpretations: [{ ...entry, values: [{ representation: 'assume-utf8' }] }],
    }).success,
  ).toBe(false)
  expect(toolHistoryConfigSchema.parse({ mode: 'verify', interpretations: [] })).toEqual({
    mode: 'verify',
    interpretations: [],
  })
})
