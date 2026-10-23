// The pure verdicts of a preparation lease over the call facts it read. Every reason is its own
// variant (DP-01). The judges compare identities and adoptions that Model owns; they never compare
// message content, and they never see an access or a tenant.
import type { CallAccount } from '@omne-harness/call-account'
import { messageIdEquals, type Message, type MessageId } from '@omne-harness/message'
import type {
  Adoption,
  AnchorMiss,
  DispatchRecord,
  MeterCalibration,
  MeterRepresentation,
  ModelCallId,
  OutputWithheld,
} from '@omne-harness/model-contract'
import type { CallFactsLookup, CallFactsView } from './facts.ts'

/**
 * The anchor verdict of the lease. `continuation-shrank` is judged by the family meter, which
 * alone can count the new part, so the lease never gives it.
 */
export type AnchorVerdict =
  | Readonly<{ kind: 'hit'; covered: readonly MessageId[]; inputTotal: string }>
  | Readonly<{ kind: 'miss'; reason: Exclude<AnchorMiss, 'continuation-shrank'> }>

export type OutputVerdict = MeterCalibration['outputs'][number]

/** The judgment of one source: the count of its output, or why it is withheld. */
type OutputJudgment =
  | Readonly<{ kind: 'known'; outputTokens: string }>
  | Readonly<{ kind: 'withheld'; reason: OutputWithheld }>

type Accounted = DispatchRecord & Readonly<{ account: CallAccount }>

/** The dispatches of a call that carry an account: exactly one is usable. */
type Settled =
  | Readonly<{ kind: 'single'; record: Accounted }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'ambiguous' }>

const DECIMAL = /^(0|[1-9][0-9]*)$/u

function hasAccount(record: DispatchRecord): record is Accounted {
  return record.account !== null
}

/**
 * A retry or a fallback gives a call a second accounted dispatch. The record does not say which
 * one the current prefix matches, so the lease does not guess (the design accepts this miss).
 */
function settledOf(records: readonly DispatchRecord[]): Settled {
  const accounted = records.filter(hasAccount)
  const [only, second] = accounted
  if (only === undefined) return { kind: 'none' }
  if (second !== undefined) return { kind: 'ambiguous' }
  return { kind: 'single', record: only }
}

/** The known decimal count of one usage item, or `null` for unknown, provisional or absent. */
function usageOf(account: CallAccount, name: string): string | null {
  const item = account.usage.find(entry => entry.name === name)
  if (item === undefined || item.state !== 'known' || !DECIMAL.test(item.lexeme)) return null
  return item.lexeme
}

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function isPrefix(prefix: readonly MessageId[], messages: readonly MessageId[]): boolean {
  if (prefix.length > messages.length) return false
  return prefix.every((id, index) => {
    const current = messages[index]
    return current !== undefined && messageIdEquals(id, current)
  })
}

/** True when the dispatch has a receipt that names the supplier adoption of this binding. */
function namesSupplier(record: Accounted, supplier: Adoption): boolean {
  const receipt = record.materialization?.receipt
  return receipt !== undefined && sameAdoption(receipt.supplier, supplier)
}

/** Which adoption of the receipt differs from this binding: supplier first, then representation. */
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

/**
 * The one accounted dispatch of the continued call, or the miss that stands in its way. A call
 * without an accounted dispatch has no usage to anchor on.
 */
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

/** The usage items of the real input total, when every one of them is a known count. */
function inputTotalOf(account: CallAccount): string | null {
  const parts = ['input', 'cache-read', 'cache-write'].map(name => usageOf(account, name))
  let total = 0n
  for (const part of parts) {
    if (part === null) return null
    total += BigInt(part)
  }
  return String(total)
}

/**
 * The four conditions of the design, each with its own reason; the first failing check wins.
 * Usage that contradicts itself already reads as an unknown `input`, so it is `usage-unknown`.
 */
export function judgeAnchor(
  input: Readonly<{
    continues: ModelCallId | null
    facts: CallFactsView
    /** The adoption of the supplier of this binding. */
    supplier: Adoption
    representation: MeterRepresentation
    /** The message identities of this request, in order. */
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

/**
 * O is a fact of the supplier, not of the representation: the source check compares only that a
 * receipt exists and that it names the supplier adoption of this binding.
 */
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

/** True when the message may carry reasoning state parts into a request. */
function carriesState(message: Message): boolean {
  return (
    message.role === 'assistant' && message.replay !== undefined && message.replay.at.length > 0
  )
}

/**
 * One entry per message of this request that has a declared source, judged; and one `source-missing`
 * entry per assistant message that carries reasoning state without a declared source. A source
 * declared for a message that is not in the request is dropped. Model does not verify that the
 * source produced the message: the request assembler owns that fact.
 */
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
