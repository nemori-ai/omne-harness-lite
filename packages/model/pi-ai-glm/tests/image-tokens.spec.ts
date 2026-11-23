import type { MediaMeasurementFact } from '@omne-harness/model-contract'
import { readFileSync } from 'node:fs'
import { GLM_RECORDS } from '../src/records.ts'
import { expect, it } from 'vitest'
import { imageExtras } from '../src/image-tokens.ts'

function dimensions(widthPixels: string, heightPixels: string): MediaMeasurementFact {
  return {
    reference: {
      storage: 'test',
      key: 'png',
      mediaType: 'image/png',
      bytes: '100',
      digest: 'test-png',
    },
    bytes: '100',
    mediaType: 'image/png',
    kind: 'image',
    widthPixels,
    heightPixels,
  }
}
const rule = { tilePixels: '8', tokensPerTile: '3', overheadTokens: '2' }

it('charges the record’s rate per two-dimensional tile and its overhead per image in that message', () => {
  const units = [{ images: 1 }, { images: 0 }, { images: 2 }]
  const images = [dimensions('8', '8'), dimensions('9', '8'), dimensions('9', '9')]
  expect(imageExtras(rule, units, images)).toEqual({ ok: [5n, 0n, 22n] })
  expect(imageExtras({ ...rule, tilePixels: '16' }, units, images)).toEqual({ ok: [5n, 0n, 10n] })
  expect(imageExtras({ ...rule, overheadTokens: '0' }, units, images)).toEqual({
    ok: [3n, 0n, 18n],
  })
})

it('ignores non-image observations when matching dimensions to image occurrences', () => {
  const file: MediaMeasurementFact = {
    kind: 'file',
    mediaType: 'text/plain',
    bytes: '1',
    reference: {
      storage: 'test',
      key: 'words',
      mediaType: 'text/plain',
      bytes: '1',
      digest: 'words',
    },
  }
  const units = [{ images: 1 }, { images: 0 }, { images: 1 }]
  expect(imageExtras(rule, units, [dimensions('8', '8'), file, dimensions('9', '9')])).toEqual({
    ok: [5n, 0n, 14n],
  })
  expect(imageExtras(rule, units, [dimensions('8', '8'), file])).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'image-measurement-missing' },
  })
})

it('requires one observation per image and strictly positive dimensions; text costs no image tokens', () => {
  expect(imageExtras(undefined, [{ images: 0 }], [])).toEqual({ ok: [0n] })
  expect(imageExtras(rule, [{ images: 1 }], [])).toMatchObject({
    failure: {
      kind: 'unavailable',
      dependency: '@omne-harness/pi-ai-glm',
      diagnostic: 'image-measurement-missing',
    },
  })
  expect(imageExtras(rule, [], [dimensions('8', '8')])).toMatchObject({
    failure: { diagnostic: 'image-measurement-missing' },
  })
  expect(imageExtras(undefined, [{ images: 1 }], [dimensions('8', '8')])).toMatchObject({
    failure: { diagnostic: 'image-rule-missing' },
  })
  for (const invalid of ['0', '-1', 'unknown', '1.5']) {
    for (const fact of [dimensions(invalid, '8'), dimensions('8', invalid)])
      expect(imageExtras(rule, [{ images: 1 }], [fact])).toMatchObject({
        failure: { diagnostic: 'invalid-image-dimensions' },
      })
  }
})

it('rejects malformed rates before arithmetic', () => {
  for (const invalid of [
    { tilePixels: '0' },
    { tokensPerTile: '0' },
    { overheadTokens: '-1' },
    { overheadTokens: '0x10' },
  ])
    expect(() =>
      imageExtras({ ...rule, ...invalid }, [{ images: 1 }], [dimensions('8', '8')]),
    ).toThrow(RangeError)
})

it.each(GLM_RECORDS.filter(record => record.wire.image !== null))(
  'covers the measured image prompt increment on the fixed endpoint for $name',
  record => {
    const observation = new URL(
      './fixtures/observations/' + record.name.split('/')[1] + '.json',
      import.meta.url,
    )
    const data = JSON.parse(readFileSync(observation, 'utf8')) as {
      pin: string
      samples: Record<string, { status: number; usage: { prompt_tokens: number } }>
    }
    expect([data.pin]).toEqual(record.serving.order)
    const observed = (sample: string) => {
      const row = data.samples['image-' + sample]
      if (row?.status !== 200 || !Number.isSafeInteger(row.usage.prompt_tokens))
        throw Error('missing measured image sample: ' + sample)
      return BigInt(row.usage.prompt_tokens)
    }
    const base = observed('0')
    for (const [width, height] of [
      [192, 192],
      [384, 384],
      [768, 768],
      [1024, 1024],
      [896, 224],
      [224, 896],
    ] as const) {
      const result = imageExtras(
        record.meter.image,
        [{ images: 1 }],
        [dimensions(String(width), String(height))],
      )
      if ('failure' in result || result.ok[0] === undefined) throw Error('image estimate missing')
      const sample = width === height ? String(width) : width + 'x' + height
      const increment = observed(sample) - base
      expect(increment).toBeGreaterThan(0n)
      expect(result.ok[0]).toBeGreaterThanOrEqual(increment)
    }
  },
)
