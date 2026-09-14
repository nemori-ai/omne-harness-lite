import * as budgetApi from '@omne-harness-lite/budget'
import type { CodecLimits, CommitEnvelope } from '@omne-harness-lite/records'
import type { Money } from '@omne-harness-lite/work-data'
import type {
  Allocation,
  AttemptExposure,
  Budget,
  BudgetLedger,
  BudgetResult,
  ChargeAttempt,
  CostSource,
  DecodedBudgetEnvelope,
  MeterFact,
  Period,
} from '@omne-harness-lite/budget'

declare const amount: Money
declare const budget: Budget
declare const period: Period
declare const source: CostSource
declare const allocation: Allocation
declare const attempt: ChargeAttempt
declare const fact: MeterFact
declare const envelope: CommitEnvelope
declare const decoded: DecodedBudgetEnvelope
declare const ledger: BudgetLedger
declare const exposure: AttemptExposure
declare const limits: CodecLimits

const values = [budget, period, source, allocation, attempt, fact, decoded, exposure]
void values

const moneyResult: BudgetResult<Money> = budgetApi.addMoney(amount, amount)
const decodedResult: BudgetResult<DecodedBudgetEnvelope> = budgetApi.decodeBudgetEnvelope(
  envelope,
  limits,
)
const nextResult: BudgetResult<BudgetLedger> = budgetApi.applyBudgetEnvelope(
  budgetApi.createBudgetLedger(),
  envelope,
  limits,
)
void [moneyResult, decodedResult, nextResult]

// @ts-expect-error recovered state is immutable to consumers
ledger.attempts.push(ledger.attempts[0])
// @ts-expect-error no runtime host is published by this pure data package
budgetApi.createBudgetHost
// @ts-expect-error no Cordis plugin is published by this pure data package
budgetApi.BudgetPlugin
// @ts-expect-error source-fact registration belongs to the later runtime slice
budgetApi.registerChargeSourceFacts
