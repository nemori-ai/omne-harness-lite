import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import { openJsonlSessionLog } from '../src/index.ts'
import { object } from '../src/input.ts'
import { processOwnership, entry, root, session, unfenced, unconditional } from './support.ts'

function record(value: JsonValue | undefined): JsonObject {
  if (value === undefined || !object(value)) throw new Error('fixture object missing')
  return value
}
it('stores accepted MS6/MR9 values, exact configuration and business-invalid arrays across reopen', async () => {
  const read = readJsonStrict(
    await readFile(new URL('./fixtures/model-response-v9.json', import.meta.url), 'utf8'),
  )
  if ('failed' in read) throw new Error('normative data fixture syntax')
  const original = record(read.ok)
  const route = record(original.route)
  const adaptation = record(route.adaptation)
  const config = record(adaptation.configuration)
  const preciseBinding = {
    ...adaptation,
    configuration: {
      ...config,
      values: {
        exact: new LosslessNumber('9007199254740993'),
        decimal: new LosslessNumber('0.123456789012345678901234567890123456789'),
        arrays: [null, { nested: ['keep', false] }],
      },
    },
  }
  const precise = {
    ...original,
    dispatch: new LosslessNumber('9007199254740993'),
    attemptId: new LosslessNumber('9007199254740993'),
    cost: {
      source: 'upstream_usage',
      cost_usd: new LosslessNumber('0.0031000000000000000000000000000000001'),
    },
    route: {
      ...route,
      adaptation: preciseBinding,
      profileSnapshot: { ...record(route.profileSnapshot), adaptation: preciseBinding },
    },
  }
  const response = judgeModelResponse(precise)
  if ('rejected' in response)
    throw new Error(`MR9 normative fixture rejected: ${response.rejected}`)
  const message = judgeMessage(original.reply)
  if ('rejected' in message) throw new Error(`MS6 reply fixture rejected: ${message.rejected}`)
  const illegalMessage = { type: 'assistant', id: 'missing-fields', blocks: [] }
  const illegalResponse = { ...precise, raw: { headers: { 'x-multi': ['a', 42] } } }
  expect(judgeMessage(illegalMessage)).toHaveProperty('rejected')
  expect(judgeModelResponse(illegalResponse)).toHaveProperty('rejected')
  const inputs = [message.ok, precise, illegalMessage, illegalResponse]
  const expected = inputs.map(value => writeJsonLossless(value))
  const dir = await root()
  const owner = await openJsonlSessionLog({ processOwnership, dir })
  try {
    expect(
      await owner.append(
        session(),
        inputs.map((value, index) => entry(`data-${index}`, value)),
        unfenced,
        unconditional,
      ),
    ).toEqual({ positions: [1, 2, 3, 4], tail: 4 })
    for (const result of [
      await owner.readSince(session(), 0),
      await owner.readByKey(session(), 'read'),
    ]) {
      if ('failure' in result) throw new Error('read failed')
      expect(result.entries.map(value => writeJsonLossless(value.payload))).toEqual(expected)
      expect(judgeMessage(result.entries[0]?.payload)).toHaveProperty('ok')
      expect(judgeModelResponse(result.entries[1]?.payload)).toHaveProperty('ok')
      expect(judgeMessage(result.entries[2]?.payload)).toHaveProperty('rejected')
      expect(judgeModelResponse(result.entries[3]?.payload)).toHaveProperty('rejected')
    }
  } finally {
    await owner.close()
  }
  const reopened = await openJsonlSessionLog({ processOwnership, dir })
  try {
    const result = await reopened.readSince(session(), 0)
    if ('failure' in result) throw new Error('reopen read failed')
    expect(result.entries.map(value => writeJsonLossless(value.payload))).toEqual(expected)
  } finally {
    await reopened.close()
  }
})
