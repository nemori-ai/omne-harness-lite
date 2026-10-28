import type { DurableEvidence, SessionOperationId } from './identity.ts'
import type { WorkSnapshot, ResidentAdoption, RunTerminal } from './values.ts'
import type { HistoryEntry, SessionFailure } from './faces.ts'
import { encodeEntry } from './entries.ts'
import { digestOf } from './operations.ts'
import type { Decision, EncodedEntry } from './judgments.ts'

export const rejected = (failure: SessionFailure): Decision => ({ kind: 'rejected', failure })
export const invalid = (field: string, reason: string): Decision =>
  rejected({ kind: 'invalid', field, reason })
export const entries = (values: readonly EncodedEntry[]): Decision => ({
  kind: 'entries',
  entries: values,
})
export const sourceOf = (operation: SessionOperationId, what: string): DurableEvidence => ({
  owner: '@omne-harness/session-contract',
  record: `${operation}/${what}`,
  revision: '1',
  digest: `sha256:${digestOf({ operation, what })}`,
})
export const originOf = (source: DurableEvidence): HistoryEntry['origin'] => ({
  owner: 'session',
  via: 'direct',
  source,
})
export const completeEvidence = (source: DurableEvidence): boolean =>
  [source.owner, source.record, source.revision, source.digest].every(part => part.length > 0)

export function residentEntries(
  snapshot: WorkSnapshot | null,
  material: ResidentAdoption | undefined,
  source: DurableEvidence,
): Decision {
  if (material === undefined) return entries([])
  const known = new Map(
    (snapshot?.residents ?? []).map(resident => [resident.capability, resident]),
  )
  const keys = new Set<string>()
  for (const pair of material.keys) {
    if (!pair.capability || !pair.key || keys.has(pair.capability))
      return invalid('residentAdoption.keys', 'empty or duplicate capability/key')
    keys.add(pair.capability)
  }
  const out: EncodedEntry[] = []
  for (const resident of material.residents) {
    if (!resident.capability || !resident.version || !completeEvidence(resident.admitted))
      return invalid('residentAdoption.residents', 'incomplete resident')
    const prior = known.get(resident.capability)
    if (prior !== undefined) {
      if (digestOf(prior.shape) !== digestOf(resident.shape))
        return invalid(
          'residentAdoption.residents',
          'resident shape changed; Tool must provide a freeze verdict',
        )
    } else {
      known.set(resident.capability, resident)
      out.push(encodeEntry({ kind: 'session.tool-resident-admitted', resident }, originOf(source)))
    }
  }
  if (
    [...known.keys()].some(capability => !keys.has(capability)) ||
    [...keys].some(capability => !known.has(capability))
  )
    return invalid('residentAdoption.keys', 'keys must cover the complete resident capability set')
  return entries(out)
}

export function terminalEntries(
  snapshot: WorkSnapshot,
  terminal: RunTerminal,
  source: DurableEvidence,
  interpretation?: Readonly<{
    sequence: string | null
    cause: DurableEvidence | null
    disposition: DurableEvidence
  }>,
): EncodedEntry[] {
  const out: EncodedEntry[] = []
  if (snapshot.run.kind === 'active' && snapshot.run.advance !== null)
    out.push(
      encodeEntry(
        {
          kind: 'run.attempt-released',
          run: snapshot.run.run,
          attempt: snapshot.run.advance.attempt,
          reason: terminal.outcome === 'cancelled' ? 'cancelled' : 'ended',
        },
        originOf(source),
      ),
    )
  out.push(
    encodeEntry(
      {
        kind: 'run.terminal',
        terminal,
        sequence: interpretation?.sequence ?? null,
        cause: interpretation?.cause ?? null,
        disposition: interpretation?.disposition ?? source,
        bounded: null,
      },
      originOf(source),
    ),
  )
  if (snapshot.frozen !== null && snapshot.pending.length > 0)
    out.push(encodeEntry({ kind: 'intake.released', inputs: snapshot.pending }, originOf(source)))
  return out
}
