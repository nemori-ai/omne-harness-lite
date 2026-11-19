import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { LedgerDomain } from '@omne-harness/tool'
import type { ToolCallId, ToolFailure } from '@omne-harness/tool-contract'
import type {
  ToolStartAuthority,
  ToolStartRelease,
  ToolStartReleaseReading,
  ToolStartReleases,
} from '@omne-harness/tool-contract/provider'
import type { TenantId } from '@omne-harness/legal-identity'

export type StartAuthorityWithReleases<P> = ToolStartAuthority<P> & ToolStartReleases<P>

type Held = Readonly<{
  kind: string
  call?: ToolCallId
  release?: ToolStartRelease
  acceptance?: Readonly<{ revision: string }>
}>
type Entry = (
  raw: unknown,
) => Promise<Outcome<Readonly<{ tenant: TenantId; call: ToolCallId }>, ToolFailure>>
type Read = (
  domain: LedgerDomain,
) => Promise<Outcome<Readonly<{ records: ReadonlyMap<string, Held> }>, ToolFailure>>

// A call whose start was accepted again answers the release of its latest acceptance.
function latestRelease(records: Iterable<Held>, call: ToolCallId): ToolStartReleaseReading {
  let latest: Held | undefined
  for (const record of records) {
    if (record.kind !== 'acceptance' || record.call !== call || record.release === undefined)
      continue
    const revision = BigInt(record.acceptance?.revision ?? '0')
    if (latest === undefined || revision > BigInt(latest.acceptance?.revision ?? '0'))
      latest = record
  }
  return latest?.release === undefined
    ? { kind: 'absent' }
    : { kind: 'released', release: latest.release }
}

export function startReleases<P>(
  entry: Entry,
  read: Read,
  domainOf: (tenant: TenantId, call: ToolCallId) => LedgerDomain,
): ToolStartReleases<P>['releaseOf'] {
  return async raw => {
    const checked = await entry(raw)
    if ('failure' in checked) return checked
    const { tenant, call } = checked.ok
    const snapshot = await read(domainOf(tenant, call))
    if ('failure' in snapshot) return snapshot
    return succeed(latestRelease(snapshot.ok.records.values(), call))
  }
}
