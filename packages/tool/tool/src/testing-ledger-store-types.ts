import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolLedgerStore } from './ledger-store.ts'

type Awaitable<T> = T | Promise<T>

/** Each handle arms the next matching store IO. Omitted handles produce NotApplicable. */
export type ToolLedgerStoreControls = Readonly<{
  readUnavailable?: () => Awaitable<void>
  commitUnavailable?: () => Awaitable<void>
  unknownApplied?: () => Awaitable<void>
  unknownDropped?: () => Awaitable<void>
  throwApplied?: () => Awaitable<void>
  delayed?: Readonly<{ arm(): Awaitable<void>; land(): Awaitable<void> }>
  rejectedHostValue?: () => unknown
}>

/** A fresh store for one case. The consumer owns cleanup, including failed cases. */
export type ToolLedgerStoreFixture = Readonly<{
  store: ToolLedgerStore<ContentBlock>
  controls: ToolLedgerStoreControls
  close(): Awaitable<void>
}>

// Structurally checked against the existing ConformanceCase at the testing entry.
export type LedgerStoreCase = Readonly<{
  name: string
  clause: string
  run(fixture: ToolLedgerStoreFixture): Promise<void>
}>

export type StoreCaseDependencies = Readonly<{
  missing(handle: string): never
  tenant(organization: string, account: string): import('./ledger-store.ts').TenantId
}>
