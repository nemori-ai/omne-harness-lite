import { expect, it } from 'vitest'
import { calibratedAmount } from '@omne-harness/pi-ai-transport/chat-completions'
import type { JsonValue } from '@omne-harness/json-text'

const tokenInput: JsonValue = {
  kind: 'object',
  entries: [{ key: 'messages', value: { kind: 'array', items: [{ kind: 'null' }] } }],
}
async function measured(coldRequestTokens?: string, anchored = false) {
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
it('keeps the optional field absent equivalent to zero for other families', async () => {
  expect(await measured()).toEqual(await measured('0'))
})
it('does not charge a fixed request allowance again after an actual-usage anchor hit', async () => {
  expect(await measured('115', true)).toEqual(await measured('0', true))
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
