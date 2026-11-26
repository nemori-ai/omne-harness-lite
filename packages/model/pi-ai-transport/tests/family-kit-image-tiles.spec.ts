import type { MediaMeasurementFact } from '@omne-harness/model-contract'
import { expect, it } from 'vitest'
import { tileImageTokens } from '../src/family-kit/index.ts'

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
const OWNER = '@omne-harness/family-kit-tests'

function unitsOf(...counts: number[]) {
  return counts.map(count => ({ images: Array.from({ length: count }, () => null), files: false }))
}

function imageExtras(
  tiles: Parameters<typeof tileImageTokens>[1],
  units: readonly Readonly<{ images: number }>[],
  media: Parameters<typeof tileImageTokens>[3],
) {
  return tileImageTokens(OWNER, tiles, unitsOf(...units.map(unit => unit.images)), media)
}

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
      dependency: OWNER,
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

it('refuses to count a request that references a file: its text is extracted upstream', () => {
  const units = [{ images: [], files: true }]
  expect(tileImageTokens(OWNER, rule, units, [])).toMatchObject({
    failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'file-text-not-countable' },
  })
})
