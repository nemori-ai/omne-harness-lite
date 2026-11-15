import type { FactCommandV2 } from '@omne-harness/sql-contract'

export type CalendarSupplyStorageAuthorityRequirement = Readonly<{
  systemScopeRef: string
  action: 'run.prepare' | 'run.complete' | 'probe.record' | 'ack.prepare' | 'material.preserve'
  payloadDigest: string
}>
export type CalendarSupplyStorageAuthorityFact = Readonly<{
  decision: 'allowed' | 'denied'
  binding: CalendarSupplyStorageAuthorityRequirement
}>
export type CalendarSupplyStorageAuthority = Readonly<{
  participant: string
  command(binding: CalendarSupplyStorageAuthorityRequirement): FactCommandV2
}>
