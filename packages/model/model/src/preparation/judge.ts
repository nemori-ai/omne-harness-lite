import type { CallAccount } from '@omne-harness/call-account'
import { messageIdEquals, type Message, type MessageId } from '@omne-harness/message'
import type {
  Adoption,
  AnchorMiss,
  DispatchRecord,
  MeterRepresentation,
  ModelCallId,
} from '@omne-harness/model-contract'
import type { MeterCalibration, OutputWithheld } from '@omne-harness/model-contract/provider'
import { sameAdoption } from '../adoption.ts'
import type { CallFactsLookup, CallFactsView } from './facts.ts'

export type AnchorVerdict =
  | Readonly<{ kind: 'hit'; covered: readonly MessageId[]; inputTotal: string }>
  | Readonly<{ kind: 'miss'; reason: Exclude<AnchorMiss, 'continuation-shrank'> }>

export type OutputVerdict = MeterCalibration['outputs'][number]

type OutputJudgment =
  | Readonly<{ kind: 'known'; outputTokens: string }>
  | Readonly<{ kind: 'withheld'; reason: OutputWithheld }>

type Accounted = DispatchRecord & Readonly<{ account: CallAccount }>

type Settled =
  | Readonly<{ kind: 'single'; record: Accounted }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'ambiguous' }>

const DECIMAL = /^(0|[1-9][0-9]*)$/u

function hasAccount(record: DispatchRecord): record is Accounted {
  return record.account !== null
}

function settledOf(records: readonly DispatchRecord[]): Settled {
  const accounted = records.filter(hasAccount)
  const [only, second] = accounted
  if (only === undefined) return { kind: 'none' }
  if (second !== undefined) return { kind: 'ambiguous' }
  return { kind: 'single', record: only }
}

function usageOf(account: CallAccount, name: string): string | null {
  const item = account.usage.find(entry => entry.name === name)
  if (item === undefined || item.state !== 'known' || !DECIMAL.test(item.lexeme)) return null
  return item.lexeme
}

function isPrefix(prefix: readonly MessageId[], messages: readonly MessageId[]): boolean {
  if (prefix.length > messages.length) return false
  return prefix.every((id, index) => {
    const current = messages[index]
    return current !== undefined && messageIdEquals(id, current)
  })
}

function namesSupplier(record: Accounted, supplier: Adoption): boolean {
  const receipt = record.materialization?.receipt
  return receipt !== undefined && sameAdoption(receipt.supplier, supplier)
}

function receiptMismatch(
  record: Accounted,
  supplier: Adoption,
  representation: Adoption,
): 'supplier' | 'representation' | null {
  const receipt = record.materialization?.receipt
  if (receipt === undefined || !namesSupplier(record, supplier)) return 'supplier'
  if (!sameAdoption(receipt.representation, representation)) return 'representation'
  return null
}

type AnchorMissVerdict = Extract<AnchorVerdict, { kind: 'miss' }>

function miss(reason: AnchorMissVerdict['reason']): AnchorMissVerdict {
  return { kind: 'miss', reason }
}

function accountedOf(
  lookup: CallFactsLookup | undefined,
): Readonly<{ kind: 'record'; record: Accounted }> | AnchorMissVerdict {
  if (lookup === undefined || lookup.kind === 'absent') return miss('call-unreadable')
  if (lookup.kind === 'unavailable') return miss('facts-unavailable')
  const settled = settledOf(lookup.records)
  if (settled.kind === 'ambiguous') return miss('ambiguous-dispatch')
  if (settled.kind === 'none') return miss('usage-unknown')
  return { kind: 'record', record: settled.record }
}

function inputTotalOf(account: CallAccount): string | null {
  const parts = ['input', 'cache-read', 'cache-write'].map(name => usageOf(account, name))
  let total = 0n
  for (const part of parts) {
    if (part === null) return null
    total += BigInt(part)
  }
  return String(total)
}

export function judgeAnchor(
  input: Readonly<{
    continues: ModelCallId | null
    facts: CallFactsView
    supplier: Adoption
    representation: MeterRepresentation
    messages: readonly MessageId[]
  }>,
): AnchorVerdict {
  if (input.continues === null) return miss('not-declared')
  const accounted = accountedOf(input.facts.get(input.continues))
  if (accounted.kind === 'miss') return accounted
  const { record } = accounted
  if (record.messages === undefined) return miss('messages-unrecorded')
  const mismatch = receiptMismatch(record, input.supplier, input.representation.adoption)
  if (mismatch === 'supplier') return miss('supplier-changed')
  if (mismatch === 'representation') return miss('representation-changed')
  if (!isPrefix(record.messages, input.messages)) return miss('not-a-prefix')
  const inputTotal = inputTotalOf(record.account)
  if (inputTotal === null) return miss('usage-unknown')
  if (input.representation.units === undefined) return miss('units-missing')
  return { kind: 'hit', covered: record.messages, inputTotal }
}

function withheld(reason: OutputWithheld): OutputJudgment {
  return { kind: 'withheld', reason }
}

function judgeOutput(lookup: CallFactsLookup | undefined, supplier: Adoption): OutputJudgment {
  if (lookup === undefined || lookup.kind === 'absent') return withheld('source-unreadable')
  if (lookup.kind === 'unavailable') return withheld('source-unavailable')
  const settled = settledOf(lookup.records)
  if (settled.kind === 'ambiguous') return withheld('ambiguous-dispatch')
  if (settled.kind === 'none') return withheld('output-unknown')
  const { record } = settled
  if (!namesSupplier(record, supplier)) return withheld('supplier-changed')
  const output = usageOf(record.account, 'output')
  if (output === null) return withheld('output-unknown')
  const reasoning = usageOf(record.account, 'reasoning')
  if (reasoning !== null && BigInt(reasoning) > BigInt(output))
    return withheld('reasoning-exceeds-output')
  return { kind: 'known', outputTokens: output }
}

function entry(message: MessageId, judgment: OutputJudgment): OutputVerdict {
  switch (judgment.kind) {
    case 'known':
      return { message, kind: 'known', outputTokens: judgment.outputTokens }
    case 'withheld':
      return { message, kind: 'withheld', reason: judgment.reason }
    default: {
      const _exhaustive: never = judgment
      return _exhaustive
    }
  }
}

function carriesState(message: Message): boolean {
  return (
    message.role === 'assistant' && message.replay !== undefined && message.replay.at.length > 0
  )
}

export function judgeOutputs(
  input: Readonly<{
    sources: ReadonlyMap<MessageId, ModelCallId>
    facts: CallFactsView
    supplier: Adoption
    messages: readonly Message[]
  }>,
): readonly OutputVerdict[] {
  const outputs: OutputVerdict[] = []
  for (const message of input.messages) {
    const source = input.sources.get(message.id)
    if (source === undefined) {
      if (carriesState(message)) outputs.push(entry(message.id, withheld('source-missing')))
      continue
    }
    outputs.push(entry(message.id, judgeOutput(input.facts.get(source), input.supplier)))
  }
  return outputs
}
