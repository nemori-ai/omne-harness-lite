import { parseDuration } from '@omne-harness/utc-instant'
import { addDecimals, formatDecimal, parseLexeme } from './decimal.ts'

export const COST_SOURCES = ['supplier', 'observation', 'billable', 'ledger'] as const
export type CostSource = (typeof COST_SOURCES)[number]
export const SUBJECT_KINDS = ['model_call', 'tool_execution'] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]

export type Amount =
  | { readonly state: 'unknown'; readonly unit: string }
  | { readonly state: 'known' | 'provisional'; readonly lexeme: string; readonly unit: string }

export type UsageItem = Amount & { readonly name: string }
export type CostItem = Amount & { readonly source: CostSource }

export type CallAccount = {
  readonly subject: { readonly kind: SubjectKind; readonly id: string }
  readonly usage: readonly UsageItem[]
  readonly cost: readonly CostItem[]
  readonly trimmed: Amount
  readonly place: string
  readonly duration: string | { readonly state: 'unknown' }
  readonly receipt: 'received' | 'late'
  readonly revision: string
}

export type AccountRejection =
  | 'extra'
  | 'subject'
  | 'usage'
  | 'cost'
  | 'trimmed'
  | 'place'
  | 'duration'
  | 'receipt'
  | 'revision'
  | 'lexeme'
  | 'precision'
  | 'unit'
  | 'source'

export type AccountResult = { readonly ok: CallAccount } | { readonly rejected: AccountRejection }
export type SubtotalResult =
  | { readonly ok: { readonly state: 'known'; readonly lexeme: string; readonly unit: string } }
  | { readonly ok: { readonly state: 'unknown' } }
  | { readonly rejected: AccountRejection }
export type PayableResult =
  | { readonly ok: { readonly state: 'known'; readonly lexeme: string; readonly unit: string } }
  | { readonly ok: { readonly state: 'unknown' } }
  | { readonly rejected: AccountRejection }

const REVISION = /^(0|[1-9][0-9]*)$/u

export function judgeCallAccount(value: unknown): AccountResult {
  if (!isRecord(value)) return rejected('extra')
  if (
    !exactKeys(value, [
      'subject',
      'usage',
      'cost',
      'trimmed',
      'place',
      'duration',
      'receipt',
      'revision',
    ])
  )
    return rejected('extra')
  const subject = judgeSubject(value.subject)
  if ('rejected' in subject) return subject
  const usage = judgeUsage(value.usage)
  if ('rejected' in usage) return usage
  const cost = judgeCost(value.cost)
  if ('rejected' in cost) return cost
  const trimmed = judgeTrimmed(value.trimmed)
  if ('rejected' in trimmed) return trimmed
  const scalars = judgeScalars(value)
  if ('rejected' in scalars) return scalars
  return {
    ok: { subject: subject.ok, usage: usage.ok, cost: cost.ok, trimmed: trimmed.ok, ...scalars.ok },
  }
}

export function admitRevision(previous: unknown, next: unknown): AccountResult {
  const first = judgeCallAccount(previous)
  if ('rejected' in first) return first
  const second = judgeCallAccount(next)
  if ('rejected' in second) return second
  if (
    first.ok.subject.kind !== second.ok.subject.kind ||
    first.ok.subject.id !== second.ok.subject.id
  )
    return rejected('subject')
  if (compareRevision(second.ok.revision, first.ok.revision) > 0) return { ok: second.ok }
  return { ok: first.ok }
}

export function sourceSubtotal(account: unknown, source: unknown): SubtotalResult {
  const judged = judgeCallAccount(account)
  if ('rejected' in judged) return judged
  if (!isCostSource(source)) return rejected('source')
  const rows = knownCosts(judged.ok.cost, source)
  if (rows.length === 0) return { ok: { state: 'unknown' } }
  return sumKnown(rows)
}

function knownCosts(
  cost: readonly CostItem[],
  source: CostSource,
): readonly { readonly lexeme: string; readonly unit: string }[] {
  const rows: { lexeme: string; unit: string }[] = []
  for (const item of cost) {
    if (item.source === source && item.state === 'known')
      rows.push({ lexeme: item.lexeme, unit: item.unit })
  }
  return rows
}

function sumKnown(
  rows: readonly { readonly lexeme: string; readonly unit: string }[],
): SubtotalResult {
  const unit = rows[0]?.unit
  if (unit === undefined || rows.some(item => item.unit !== unit)) return rejected('unit')
  const only = rows[0]
  if (rows.length === 1 && only !== undefined) {
    return { ok: { state: 'known', lexeme: only.lexeme, unit } }
  }
  let total = parseLexeme('0', unit)
  if (typeof total === 'string') return rejected(total)
  for (const item of rows) {
    const parsed = parseLexeme(item.lexeme, unit)
    if (typeof parsed === 'string') return rejected(parsed)
    total = addDecimals(total, parsed)
  }
  return { ok: { state: 'known', lexeme: formatDecimal(total), unit } }
}

export function payableAmount(account: unknown): PayableResult {
  const ledger = sourceSubtotal(account, 'ledger')
  if ('rejected' in ledger) return ledger
  if (ledger.ok.state === 'known') return ledger
  return sourceSubtotal(account, 'billable')
}

export function canonicalAccount(account: CallAccount): string {
  return JSON.stringify(account)
}

function judgeTrimmed(value: unknown): Checked<Amount> {
  const amount = judgeAmount(value)
  if ('rejected' in amount && amount.rejected === 'extra') return rejected('trimmed')
  return amount
}

function judgeScalars(value: Record<string, unknown>):
  | {
      readonly ok: Pick<CallAccount, 'place' | 'duration' | 'receipt' | 'revision'>
    }
  | { readonly rejected: AccountRejection } {
  if (typeof value.place !== 'string' || value.place.length === 0) return rejected('place')
  const duration = judgeDuration(value.duration)
  if ('rejected' in duration) return duration
  if (!isReceipt(value.receipt)) return rejected('receipt')
  if (typeof value.revision !== 'string' || !REVISION.test(value.revision))
    return rejected('revision')
  return {
    ok: {
      place: value.place,
      duration: duration.ok,
      receipt: value.receipt,
      revision: value.revision,
    },
  }
}

function isReceipt(value: unknown): value is CallAccount['receipt'] {
  return value === 'received' || value === 'late'
}

function judgeSubject(value: unknown): Checked<CallAccount['subject']> {
  if (!isRecord(value) || !exactKeys(value, ['kind', 'id'])) return rejected('subject')
  if (!isSubjectKind(value.kind)) return rejected('subject')
  if (typeof value.id !== 'string' || value.id.length === 0) return rejected('subject')
  return { ok: { kind: value.kind, id: value.id } }
}

function judgeUsage(value: unknown): Checked<readonly UsageItem[]> {
  if (!Array.isArray(value)) return rejected('usage')
  const items: UsageItem[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || item.name.length === 0)
      return rejected('usage')
    const amount = judgeAmount(item, ['name'])
    if ('rejected' in amount)
      return rejected(amount.rejected === 'extra' ? 'usage' : amount.rejected)
    items.push({ name: item.name, ...amount.ok })
  }
  return { ok: items }
}

function judgeCost(value: unknown): Checked<readonly CostItem[]> {
  if (!Array.isArray(value)) return rejected('cost')
  const items: CostItem[] = []
  for (const item of value) {
    if (!isRecord(item) || !isCostSource(item.source)) return rejected('cost')
    const amount = judgeAmount(item, ['source'])
    if ('rejected' in amount)
      return rejected(amount.rejected === 'extra' ? 'cost' : amount.rejected)
    items.push({ source: item.source, ...amount.ok })
  }
  return { ok: items }
}

function judgeAmount(value: unknown, extras: readonly string[] = []): Checked<Amount> {
  if (!isRecord(value)) return rejected('extra')
  if (!isAmountState(value.state)) return rejected('lexeme')
  if (!exactKeys(value, amountKeys(value.state, extras))) return rejected('extra')
  if (typeof value.unit !== 'string' || value.unit.length === 0) return rejected('unit')
  if (value.state === 'unknown') return { ok: { state: 'unknown', unit: value.unit } }
  return knownAmount(value.state, value.lexeme, value.unit)
}

function knownAmount(
  state: 'known' | 'provisional',
  lexeme: unknown,
  unit: string,
): Checked<Amount> {
  if (typeof lexeme !== 'string') return rejected('lexeme')
  const parsed = parseLexeme(lexeme, unit)
  if (typeof parsed === 'string') return rejected(parsed)
  return { ok: { state, lexeme, unit } }
}

function isAmountState(value: unknown): value is Amount['state'] {
  return value === 'unknown' || value === 'known' || value === 'provisional'
}

function amountKeys(state: Amount['state'], extras: readonly string[]): readonly string[] {
  const base = state === 'unknown' ? ['state', 'unit'] : ['state', 'lexeme', 'unit']
  return [...base, ...extras]
}

function judgeDuration(value: unknown): Checked<CallAccount['duration']> {
  if (isRecord(value) && exactKeys(value, ['state']) && value.state === 'unknown')
    return { ok: { state: 'unknown' } }
  if (typeof value !== 'string') return rejected('duration')
  const parsed = parseDuration(value)
  if (!parsed.ok) return rejected('duration')
  return { ok: value }
}

function isSubjectKind(value: unknown): value is SubjectKind {
  return value === 'model_call' || value === 'tool_execution'
}

type Checked<T> = { readonly ok: T } | { readonly rejected: AccountRejection }

function compareRevision(left: string, right: string): number {
  const a = BigInt(left)
  const b = BigInt(right)
  if (a === b) return 0
  return a > b ? 1 : -1
}

function isCostSource(value: unknown): value is CostSource {
  return typeof value === 'string' && costSources.has(value)
}

const costSources = new Set<string>(COST_SOURCES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function rejected(code: AccountRejection): { readonly rejected: AccountRejection } {
  return { rejected: code }
}
