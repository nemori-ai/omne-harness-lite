import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { Codec } from '@omne-harness/public-contract'
import { expect } from 'vitest'

export const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
export const tenant = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
export const session = '0123456789abcdef'.repeat(4)

/** Any codec of the contract; the samples are untyped JSON, so the value type is not checked. */
type AnyCodec = Codec<any>

export function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}

export function readSample(codec: AnyCodec, sample: unknown) {
  return codec.read(tree(sample), limits)
}

/** Reads the sample, writes the value back, and checks the written JSON is the sample. */
export function expectRoundTrip(codec: AnyCodec, sample: unknown): unknown {
  const read = readSample(codec, sample)
  if (!read.ok) throw new Error('sample not accepted')
  const written = codec.write(read.value, limits)
  if (!written.ok) throw new Error('read value not written')
  expect(JSON.parse(writeJsonText(written.value))).toEqual(sample)
  return read.value
}
