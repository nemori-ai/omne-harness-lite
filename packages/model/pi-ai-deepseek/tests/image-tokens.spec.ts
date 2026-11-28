import type { MediaMeasurementFact } from '@omne-harness/model-contract'
import { readFileSync } from 'node:fs'
import { DEEPSEEK_RECORDS } from '../src/records.ts'
import { expect, it } from 'vitest'
import { tileImageTokens } from '@omne-harness/pi-ai-transport/family-kit'
import { DEEPSEEK_OWNER } from '../src/owner.ts'

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
it.each(DEEPSEEK_RECORDS.filter(record => record.wire.image !== null))(
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
      const result = tileImageTokens(
        DEEPSEEK_OWNER,
        record.meter.image,
        [{ images: [null], files: false }],
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
