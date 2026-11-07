import { expect, it } from 'vitest'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'

it.each([
  '1970-01-01T00:00:00.000Z',
  '2024-02-29T12:34:56.789Z',
  '-271821-04-20T00:00:00.000Z',
  '+275760-09-13T00:00:00.000Z',
])('accepts the canonical UTC instant %s', instant => {
  expect(decodeToolMaterialInstant(instant)).toEqual({ ok: instant })
})

it.each([
  null,
  0,
  new Date(0),
  '',
  'now',
  '2023-02-29T00:00:00.000Z',
  '2024-01-01',
  '2024-01-01T00:00:00Z',
  '2024-01-01T01:00:00.000+01:00',
  '2024-01-01T00:00:00.0000Z',
  '+275760-09-13T00:00:00.001Z',
])('rejects an invalid or noncanonical instant %#', instant => {
  expect(decodeToolMaterialInstant(instant)).toEqual({ failure: { reason: 'canonical-utc' } })
})
