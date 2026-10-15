import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import {
  admitRevision,
  canonicalAccount,
  judgeCallAccount,
  payableAmount,
  sourceSubtotal,
} from '@omne-harness/call-account'

const subject = { kind: 'model_call' as const, id: 'call_01' }

function account(cost: readonly unknown[], revision = '0') {
  return {
    subject,
    usage: [{ name: 'input', state: 'known', lexeme: '128', unit: 'token' }],
    cost,
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'provider-a',
    duration: 'PT1.5S',
    receipt: 'received',
    revision,
  }
}

it('keeps an unknown supplier cost without a lexeme', () => {
  const value = account([{ state: 'unknown', unit: 'USD', source: 'supplier' }])
  const judged = judgeCallAccount(value)
  expect(judged).toEqual({
    ok: {
      ...value,
      subject: { kind: 'model_call', id: 'call_01' },
    },
  })
  if (!('ok' in judged)) return
  expect(JSON.parse(canonicalAccount(judged.ok)).cost[0].lexeme).toBeUndefined()
})

it('rejects USD 1.234 and a fractional token as precision', () => {
  expect(
    judgeCallAccount(account([{ state: 'known', lexeme: '1.234', unit: 'USD', source: 'supplier' }])),
  ).toEqual({ rejected: 'precision' })
  expect(
    judgeCallAccount({
      ...account([]),
      usage: [{ name: 'input', state: 'known', lexeme: '1.5', unit: 'token' }],
    }),
  ).toEqual({ rejected: 'precision' })
})

it('keeps a non-USD lexeme that has more than two decimal places', () => {
  const judged = judgeCallAccount(
    account([{ state: 'known', lexeme: '1.2345', unit: 'EUR', source: 'billable' }]),
  )
  expect('ok' in judged).toBe(true)
})

it('rejects a calendar duration and accepts an unknown duration', () => {
  expect(judgeCallAccount({ ...account([]), duration: 'P1D' })).toEqual({ rejected: 'duration' })
  expect(judgeCallAccount({ ...account([]), duration: { state: 'unknown' } })).toMatchObject({
    ok: { duration: { state: 'unknown' } },
  })
})

it('replaces the whole snapshot at a higher revision and keeps the first at the same revision', () => {
  const first = account([{ state: 'known', lexeme: '1.25', unit: 'USD', source: 'billable' }], '0')
  const higher = account([{ state: 'known', lexeme: '1.50', unit: 'USD', source: 'billable' }], '1')
  higher.receipt = 'late'
  expect(admitRevision(first, higher)).toEqual(judgeCallAccount(higher))
  const different = account([{ state: 'known', lexeme: '9.00', unit: 'USD', source: 'billable' }], '0')
  expect(admitRevision(first, different)).toEqual(judgeCallAccount(first))
  expect(admitRevision(first, first)).toEqual(judgeCallAccount(first))
})

it('sums 0.1 and 0.2 as 0.3 and selects ledger 1.50 as payable', () => {
  const value = account([
    { state: 'known', lexeme: '0.1', unit: 'USD', source: 'supplier' },
    { state: 'known', lexeme: '0.2', unit: 'USD', source: 'supplier' },
    { state: 'known', lexeme: '1.00', unit: 'USD', source: 'supplier' },
    { state: 'provisional', lexeme: '9.00', unit: 'USD', source: 'billable' },
    { state: 'known', lexeme: '1.50', unit: 'USD', source: 'billable' },
    { state: 'known', lexeme: '1.50', unit: 'USD', source: 'ledger' },
  ])
  expect(sourceSubtotal(value, 'supplier')).toEqual({
    ok: { state: 'known', lexeme: '1.3', unit: 'USD' },
  })
  expect(sourceSubtotal(value, 'billable')).toEqual({
    ok: { state: 'known', lexeme: '1.50', unit: 'USD' },
  })
  expect(payableAmount(value)).toEqual({ ok: { state: 'known', lexeme: '1.50', unit: 'USD' } })
})

it('uses billable when no ledger is known and refuses mixed units', () => {
  const value = account([
    { state: 'unknown', unit: 'USD', source: 'ledger' },
    { state: 'known', lexeme: '1.50', unit: 'USD', source: 'billable' },
    { state: 'known', lexeme: '1.00', unit: 'EUR', source: 'observation' },
    { state: 'known', lexeme: '2', unit: 'token', source: 'observation' },
  ])
  expect(payableAmount(value)).toEqual({ ok: { state: 'known', lexeme: '1.50', unit: 'USD' } })
  expect(sourceSubtotal(value, 'observation')).toEqual({ rejected: 'unit' })
})

it('keeps the original lexeme text through a JSON round trip', () => {
  const value = account([{ state: 'known', lexeme: '1.50', unit: 'USD', source: 'ledger' }])
  const judged = judgeCallAccount(value)
  if (!('ok' in judged)) throw new Error('admission rejected')
  const text = canonicalAccount(judged.ok)
  const again = judgeCallAccount(JSON.parse(text))
  expect(again).toEqual(judged)
  expect(JSON.parse(text).cost[0].lexeme).toBe('1.50')
  expect(JSON.parse(text).usage[0].lexeme).toBe('128')
})

it('imports the built package for a model or tool producer and a session consumer', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = execFileSync(process.execPath, ['tests/independent-consumers.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  expect(JSON.parse(out)).toEqual({
    producer: 'tool_execution',
    payable: { state: 'known', lexeme: '1.50', unit: 'USD' },
  })
})

it('does not follow a later edit of the caller object', () => {
  const value = account([{ state: 'known', lexeme: '0.02', unit: 'USD', source: 'ledger' }])
  const judged = judgeCallAccount(value)
  value.cost[0] = { state: 'known', lexeme: '9.00', unit: 'USD', source: 'ledger' }
  expect(payableAmount('ok' in judged ? judged.ok : value)).toEqual({
    ok: { state: 'known', lexeme: '0.02', unit: 'USD' },
  })
})
