import type { ToolLedgerStore } from './ledger-store.ts'

type Awaitable<T> = T | Promise<T>

export type ToolLedgerStoreControls = Readonly<{
  readUnavailable?: () => Awaitable<void>
  commitUnavailable?: () => Awaitable<void>
  unknownApplied?: () => Awaitable<void>
  unknownDropped?: () => Awaitable<void>
  throwApplied?: () => Awaitable<void>
  delayed?: Readonly<{ arm(): Awaitable<void>; land(): Awaitable<void> }>
  rejectedHostValue?: () => unknown
}>

export type ToolLedgerStoreFixture = Readonly<{
  store: ToolLedgerStore
  controls: ToolLedgerStoreControls
  close(): Awaitable<void>
}>

export type LedgerStoreCase = Readonly<{
  name: string
  clause: string
  run(fixture: ToolLedgerStoreFixture): Promise<void>
}>

export type StoreCaseDependencies = Readonly<{
  missing(handle: string): never
  tenant(organization: string, account: string): import('./ledger-store.ts').TenantId
}>
