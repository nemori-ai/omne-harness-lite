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
export const where = { tenant, session }

type AnyCodec = Codec<any>

export function readSample(codec: AnyCodec, sample: unknown) {
  const read = readJsonText(JSON.stringify(sample), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return codec.read(read.value, limits)
}

export function expectRoundTrip(codec: AnyCodec, sample: unknown): unknown {
  const read = readSample(codec, sample)
  if (!read.ok) throw new Error('sample not accepted')
  const written = codec.write(read.value, limits)
  if (!written.ok) throw new Error('read value not written')
  expect(JSON.parse(writeJsonText(written.value))).toEqual(sample)
  return read.value
}

export const rejected = (codec: AnyCodec, sample: unknown) =>
  expect(readSample(codec, sample)).toEqual({ ok: false })

const state = {
  status: 'paused',
  attendance: 'attended',
  generation: 2,
  revision: 3,
  rounds: 7,
  pause: { by: 'verdict', row: 7, exit: null },
  outcome: null,
}
export const GOAL = {
  state,
  rendered: '## 目的\n把首页的加载时间降下来',
  body: { purpose: '把首页的加载时间降下来', criteria: [{ id: 'A1', statement: '用例全过' }] },
  gap: [
    {
      id: 'A1',
      ought: '用例全过',
      reading: '证据显示没做到',
      source: 'judge',
      ref: 'call-9',
      open: true,
      short: '',
    },
    {
      id: 'X1',
      ought: '20 轮',
      reading: '7 轮',
      source: null,
      ref: null,
      open: false,
      short: null,
    },
  ],
  progress: { criteria: { A1: { status: 'doing', refs: ['call-9'], note: '' } } },
  history: [
    {
      revision: 1,
      via: 'card',
      words: '把首页降下来',
      draftedBy: 'agent',
      confirmedBy: 'server-entry',
      operation: 'card-1',
      at: '2026-11-25T00:00:01.000Z',
    },
    {
      revision: 2,
      via: 'direct',
      words: null,
      draftedBy: 'person',
      confirmedBy: 'acc_1',
      operation: 'op-2',
      at: '2026-11-25T00:10:00.000Z',
    },
  ],
}
export const SETTLED = {
  ...GOAL,
  state: {
    ...state,
    status: 'settled',
    pause: null,
    outcome: { kind: 'exit', exit: 'X2', counts: 'failure' },
  },
}
