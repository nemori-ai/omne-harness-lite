import type { ToolCallId } from '@omne-harness/tool-contract'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import { LEDGER_OWNER, mintEvidence } from './evidence.ts'
import { put, type Mint, type Snapshot } from './ledger-decider.ts'
import type { CallAccount, LedgerWrite, TenantId } from './ledger-store.ts'

export const SETTLEMENT_EVENT = 'settlement'

/** Milliseconds as SI seconds, `PT<s>.<ms>S`; null when either instant is missing or out of order. */
export function measuredDuration(
  startedAt: ToolInstant | null | undefined,
  settledAt: ToolInstant | null,
): string | null {
  if (startedAt === null || startedAt === undefined || settledAt === null) return null
  const milliseconds = Date.parse(settledAt) - Date.parse(startedAt)
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return null
  return `PT${Math.floor(milliseconds / 1000)}.${String(milliseconds % 1000).padStart(3, '0')}S`
}

// The account of a real execution, written in the commit that settles it: revision 1 when the
// call has none, else the next revision of the same account, marked late.
export function settlementAccount(
  snapshot: Snapshot,
  place: Readonly<{ tenant: TenantId; call: ToolCallId }>,
  duration: string | null,
  mint: Mint,
): LedgerWrite {
  // The caller hands the call record in; the account names the call and nothing else of it.
  const { tenant, call } = place
  const previous = snapshot.accounts.at(-1)
  const event = previous?.event ?? SETTLEMENT_EVENT
  const value: CallAccount = {
    subject: { kind: 'tool_execution', id: call },
    usage: [],
    cost: [],
    trimmed: { state: 'known', lexeme: '0', unit: 'bytes' },
    place: LEDGER_OWNER,
    duration: duration ?? { state: 'unknown' },
    receipt: previous === undefined ? 'received' : 'late',
    revision: previous === undefined ? '1' : String(BigInt(previous.value.revision) + 1n),
  }
  return put({
    kind: 'account',
    account: {
      tenant,
      call,
      start: null,
      source: mintEvidence('account', { tenant, call, event }, mint.revision, value),
      event,
      value,
    },
  })
}
