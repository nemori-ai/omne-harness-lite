import {
  parseRecordEntryRef,
  projectMessage,
  type CompactionContext,
  type CoveredEntry,
  type Message,
  type PairingWitness,
} from '@omne-harness/message'
import { big, oneRow, rowsOf, text, type Executor } from './support.ts'
import { viewMessageText } from './shared-messages.ts'

export const MAX_COMPACTION_ROWS = 100_000
export type CompactionWindowRead =
  | Readonly<{ kind: 'context'; value: CompactionContext }>
  | Readonly<{ kind: 'behind' | 'invalid-bounds' }>
  | Readonly<{ kind: 'epoch-changed'; current: { epoch: string; upper: string } }>

export function readCompactionWindow(
  port: Executor,
  input: Readonly<{
    tenant: string
    session: string
    epoch: string
    upper: string | null
    coverTo: string | null
  }>,
): CompactionWindowRead {
  const scope = [input.tenant, input.session]
  const head = oneRow(
    port,
    `SELECT j.tail, j.epoch, c.covered, c.origin, c.protection
    FROM sl_journal j LEFT JOIN sl_compaction_head c ON c.tenant = j.tenant AND c.session = j.session
    WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    scope,
  )
  if (head === undefined || head['covered'] === null || big(head['covered']) !== big(head['tail']))
    return { kind: 'behind' }
  const epoch = text(head['epoch'])
  const last = oneRow(
    port,
    'SELECT seq FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ? ORDER BY seq DESC LIMIT 1',
    [...scope, epoch],
  )
  const upper = last === undefined ? 0n : big(last['seq'])
  const selectedUpper = input.upper ?? String(upper)
  if (input.epoch !== epoch)
    return { kind: 'epoch-changed', current: { epoch, upper: String(upper) } }
  if (
    (input.coverTo !== null && !/^[1-9][0-9]*$/.test(input.coverTo)) ||
    !/^[0-9]+$/.test(selectedUpper) ||
    BigInt(selectedUpper) > upper ||
    BigInt(selectedUpper) > BigInt(MAX_COMPACTION_ROWS)
  )
    return { kind: 'invalid-bounds' }
  const stored = rowsOf(
    port,
    `SELECT entry, message FROM sl_model_view
    WHERE tenant = ? AND session = ? AND epoch = ? AND seq <= ? ORDER BY seq LIMIT ?`,
    [...scope, epoch, BigInt(selectedUpper), BigInt(MAX_COMPACTION_ROWS + 1)],
  )
  if (stored.length !== Number(selectedUpper)) return { kind: 'behind' }
  const messages = new Map<string, CoveredEntry>()
  for (const row of stored) {
    const ref = parseRecordEntryRef(text(row['entry']))
    if (ref === null || messages.has(ref)) return { kind: 'behind' }
    const original = JSON.parse(
      viewMessageText(port, input.tenant, text(row['message'])),
    ) as Message
    messages.set(ref, { ref, message: projectMessage(original, 'toModel')?.message ?? null })
  }
  const lastMessage = [...messages.keys()].reduce<string | null>(
    (last, ref) => (last === null || BigInt(ref) > BigInt(last) ? ref : last),
    null,
  )
  const coverTo = input.coverTo ?? lastMessage
  if (coverTo === null) return { kind: 'invalid-bounds' }
  const origin = parseRecordEntryRef(text(head['origin']))
  if (origin === null) return { kind: 'behind' }
  const protection: unknown = JSON.parse(text(head['protection']))
  if (
    !Array.isArray(protection) ||
    protection.some(value => typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))
  )
    return { kind: 'behind' }
  const parsedOpen = protection.map(value => parseRecordEntryRef(value as string))
  if (parsedOpen.some(ref => ref === null)) return { kind: 'behind' }
  const open = parsedOpen.filter(ref => ref !== null)
  for (const ref of open) if (!messages.has(ref)) messages.set(ref, { ref, message: null })
  const ordered = [...messages.values()].sort((a, b) => (BigInt(a.ref) < BigInt(b.ref) ? -1 : 1))
  const prior = ordered.filter(row => row.message?.role === 'compaction').at(-1)
  if (prior === undefined && !messages.has(origin)) ordered.unshift({ ref: origin, message: null })
  const end = ordered.findIndex(row => row.ref === coverTo)
  if (end < 0 || (prior !== undefined && BigInt(prior.ref) > BigInt(coverTo)))
    return { kind: 'invalid-bounds' }
  const pairings: PairingWitness[] = []
  for (const row of ordered) {
    if (row.message?.role !== 'tool') continue
    const paired = oneRow(
      port,
      'SELECT call_entry FROM sl_message_pairing WHERE tenant = ? AND session = ? AND result = ? LIMIT 1',
      [...scope, row.ref],
    )
    if (paired === undefined) return { kind: 'behind' }
    const call =
      paired['call_entry'] === null ? null : parseRecordEntryRef(text(paired['call_entry']))
    if (paired['call_entry'] !== null && call === null) return { kind: 'behind' }
    pairings.push({ result: row.ref, call })
  }
  return {
    kind: 'context',
    value: {
      origin,
      base:
        prior === undefined
          ? { kind: 'initial', pairings }
          : { kind: 'previous', record: prior.ref, pairings },
      covered: ordered.slice(0, end + 1),
      after: ordered.slice(end + 1),
      open,
    },
  }
}
