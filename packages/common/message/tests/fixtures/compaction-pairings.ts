import type { CoveredEntry, PairingWitness, RecordEntryRef } from '@omne-harness/message'

export function pairingWitnesses(entries: readonly CoveredEntry[]): PairingWitness[] {
  const calls = new Map<string, RecordEntryRef>()
  const witnesses: PairingWitness[] = []
  for (const entry of entries)
    for (const block of entry.message?.blocks ?? []) {
      if (block.kind === 'tool_call' || block.kind === 'tool_call_unparsed')
        calls.set(block.callId, entry.ref)
      if (block.kind === 'tool_result')
        witnesses.push({ result: entry.ref, call: calls.get(block.callId) ?? null })
    }
  return witnesses
}
