import {
  addMoney,
  createBudgetLedger,
  readAttemptExposure,
  validateMoney,
} from '@omne-harness-lite/budget'
import type {
  Budget,
  BudgetLedger,
  BudgetResult,
  ChargeAttempt,
  MeterFact,
  Money,
} from '@omne-harness-lite/budget'

const left: Money = { integer: '9007199254740993', scale: 2, currency: 'USD' }
const right: Money = { integer: '7', scale: 2, currency: 'USD' }
const sum = addMoney(left, right)
if (!sum.ok || sum.value.integer !== '9007199254741000') {
  throw new Error(`unexpected exact sum: ${JSON.stringify(sum)}`)
}

const checked = validateMoney(sum.value, { nonNegative: true })
if (!checked.ok) throw new Error(`packed Money validation failed: ${JSON.stringify(checked)}`)

const ledger: BudgetLedger = createBudgetLedger()
if (ledger.throughSeq !== '0' || !Object.isFrozen(ledger)) {
  throw new Error('packed ledger did not start at its immutable recovery origin')
}

const publicTypes: readonly [
  BudgetResult<Money>,
  Budget | undefined,
  ChargeAttempt | undefined,
  MeterFact | undefined,
] = [sum, undefined, undefined, undefined]
void publicTypes
void readAttemptExposure

// @ts-expect-error runtime host belongs to a later composition slice
void import('@omne-harness-lite/budget').then(module => module.createBudgetHost)

console.log(JSON.stringify({ sum: sum.value, throughSeq: ledger.throughSeq }))
