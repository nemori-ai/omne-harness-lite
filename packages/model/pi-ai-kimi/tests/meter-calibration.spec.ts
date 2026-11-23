import { expect, it } from 'vitest'
import { calibratedAmount } from '@omne-harness/pi-ai-transport/chat-completions'
import type { JsonValue } from '@omne-harness/json-text'
import { createKimiMeter } from '../src/meter.ts'
import { profileOf } from '../src/profiles.ts'
import { componentAdoption } from '../src/adoptions.ts'
import { KIMI_RECORDS } from '../src/records.ts'

const tokenInput: JsonValue = {
  kind: 'object',
  entries: [{ key: 'messages', value: { kind: 'array', items: [{ kind: 'null' }] } }],
}
async function measured(coldRequestTokens?: string, anchored = false, shrank = false) {
  return calibratedAmount({
    tokenInput,
    units: [null],
    reasoning: [false],
    calibration: { anchor: anchored ? { inputTotal: '230', covered: [] } : null, outputs: [] },
    count: async body => ({
      ok: anchored
        ? body.kind === 'object' &&
          body.entries.some(
            entry =>
              entry.key === 'messages' &&
              entry.value.kind === 'array' &&
              entry.value.items.length > 0,
          )
          ? 10n
          : shrank
            ? 1n
            : 0n
        : 161n,
    }),
    extra: () => ({ ok: 0n }),
    uncountable: 'unknown',
    dependency: 'test',
    marginPercent: '10',
    ...(coldRequestTokens === undefined ? {} : { coldRequestTokens }),
  })
}
it('covers the measured ordinary-tool cold requests at each precise Kimi route', async () => {
  for (const record of KIMI_RECORDS) {
    const result = await measured(record.meter.coldRequestTokens)
    if (!('ok' in result)) throw Error(JSON.stringify(result))
    const upstream = record.name === 'moonshotai/kimi-k2.7-code' ? 106n : 230n
    expect(result.ok.amount + result.ok.margin).toBeGreaterThanOrEqual(upstream)
  }
})
it('keeps the optional field absent equivalent to zero for other families', async () => {
  expect(await measured()).toEqual(await measured('0'))
})
it('does not charge a fixed request allowance again after an actual-usage anchor hit', async () => {
  expect(await measured('115', true)).toEqual(await measured('0', true))
})

it('the Kimi meter forwards its measured cold allowance into the real measure path', async () => {
  for (const record of KIMI_RECORDS) {
    const source = componentAdoption(record, 'meter')
    const meter = createKimiMeter(
      record,
      { definition: record.meter.tokenizer, count: async () => ({ ok: { tokens: '161' } }) },
      { percent: '10', source },
    )
    const profile = profileOf(record, { retryPolicy: source, compactionTriggerPercent: '80' })
    const represented = meter.represent({
      instruction: [],
      turns: [],
      tools: [],
      toolChoice: 'auto',
      applied: [],
    })
    const result = await meter.instance.measure({
      profile: source,
      supplier: profile.suppliers[0],
      context: profile.context,
      limits: [],
      assembled: {
        system: [],
        messages: [],
        tools: [],
        toolChoice: 'auto',
        parameters: [],
        representation: represented.adoption,
        source,
      },
      parameters: [],
      representation: { ...represented, kind: 'materialized', media: [], requestBytes: '1' },
    })
    if (!('ok' in result)) throw Error(JSON.stringify(result))
    const check = result.ok.checks.find(check => check.metric === 'input-tokens')
    expect(check?.measurement.amount).toBe(record.name.endsWith('k2.7-code') ? '161' : '276')
  }
})
it('charges the allowance when a shrinking continuation falls back to a cold estimate', async () => {
  const counts = [-1n, 0n, 161n]
  const result = await calibratedAmount({
    tokenInput,
    units: [null],
    reasoning: [false],
    calibration: { anchor: { inputTotal: '230', covered: [] }, outputs: [] },
    count: async () => ({ ok: counts.shift() ?? 161n }),
    extra: () => ({ ok: 0n }),
    uncountable: 'unknown',
    dependency: 'test',
    marginPercent: '10',
    coldRequestTokens: '115',
  })
  if (!('ok' in result)) throw Error(JSON.stringify(result))
  expect(result.ok.amount).toBe(276n)
  expect(result.ok.anchor).toEqual({ kind: 'miss', reason: 'continuation-shrank' })
})
