import { expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import {
  addTrim,
  emptyTrims,
  equalNumbers,
  sumNumbers,
  toolAccount,
  unknownModelAccount,
} from '../src/account.ts'

it('ACCOUNT-01 compares mathematical indices and sums without a safe-integer ceiling', () => {
  expect(
    equalNumbers(new LosslessNumber('9007199254740993'), new LosslessNumber('9007199254740993.0')),
  ).toBe(true)
  expect(equalNumbers(new LosslessNumber('1e400'), new LosslessNumber('10e399'))).toBe(true)
  expect(equalNumbers(new LosslessNumber('-0'), 0)).toBe(true)
  expect(
    equalNumbers(
      sumNumbers(new LosslessNumber('9007199254740993'), 7),
      new LosslessNumber('9007199254741000'),
    ),
  ).toBe(true)
})

it('ACCOUNT-02 preserves both byte contributions and removes only one paired truncation count', () => {
  let trims = addTrim(
    emptyTrims(),
    { t: 'trim', reason: 'frame_too_long', omittedBytes: 100 },
    false,
  )
  trims = addTrim(trims, { t: 'trim', reason: 'rejected', omittedBytes: 20 }, true)
  expect(equalNumbers(trims.merged, 0)).toBe(true)
  expect(equalNumbers(trims.cut, 1)).toBe(true)
  expect(equalNumbers(trims.omittedBytes, 120)).toBe(true)
  expect(Object.keys(trims.byReason)).toEqual([
    'rate_merged',
    'frame_too_long',
    'quota_exhausted',
    'rejected',
  ])
  expect(equalNumbers(trims.byReason.frame_too_long, 0)).toBe(true)
  expect(equalNumbers(trims.byReason.rejected, 1)).toBe(true)
  const account = toolAccount(0, trims)
  expect(writeJsonLossless(account.frames.emitted)).toBe('1')
  expect(judgeAccountValue('FrameAccount', account.frames)).toEqual({ ok: true })
  trims = addTrim(trims, { t: 'trim', reason: 'rejected', omittedBytes: 1 }, false)
  expect(writeJsonLossless(trims.byReason.frame_too_long)).toBe('0')
})

it('ACCOUNT-03 unpaired truncation, merging and quota maintain all four reason counters', () => {
  let trims = addTrim(emptyTrims(), { t: 'trim', reason: 'frame_too_long', omittedBytes: 3 }, false)
  trims = addTrim(
    trims,
    { t: 'trim', reason: 'rate_merged', merged: new LosslessNumber('9007199254740993') },
    false,
  )
  trims = addTrim(trims, { t: 'trim', reason: 'quota_exhausted', omittedBytes: 0 }, false)
  expect(judgeAccountValue('TrimSummary', trims)).toEqual({ ok: true })
  expect(writeJsonLossless(trims.byReason.frame_too_long)).toBe('1')
  expect(writeJsonLossless(trims.merged)).toBe('9007199254740993')
  expect(writeJsonLossless(toolAccount(4, trims).frames.emitted)).toBe('9007199254740998')
  expect(Object.isFrozen(trims.byReason)).toBe(true)
})

it('ACCOUNT-04 missing model usage and cost are unknown, without guessed zero amounts', () => {
  const account = unknownModelAccount(emptyTrims())
  expect(account.usage).toEqual({
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  })
  expect(account.cost).toEqual({ cost_usd: 'unknown', source: 'none' })
  expect(judgeAccountValue('Usage', account.usage)).toEqual({ ok: true })
  expect(judgeAccountValue('Cost', account.cost)).toEqual({ ok: true })
})
