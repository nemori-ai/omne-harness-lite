import { createMemoryToolLedgerStore } from './testing-store.ts'
import type { ToolLedgerStoreFixture } from './testing-ledger-store-types.ts'

/** Non-durable positive control. Every conformance fault handle is available. */
export function createMemoryToolLedgerStoreFixture(): ToolLedgerStoreFixture {
  const store = createMemoryToolLedgerStore()
  return {
    store,
    controls: {
      readUnavailable: () => store.injectRead('unavailable'),
      commitUnavailable: () => store.injectCommit('unavailable'),
      unknownApplied: () => store.injectCommit('unknown-applied'),
      unknownDropped: () => store.injectCommit('unknown-dropped'),
      throwApplied: () => store.injectCommit('throw-applied'),
      delayed: {
        arm: () => store.injectCommit('unknown-delayed'),
        land: () => {
          store.landDelayed()
        },
      },
      rejectedHostValue: () => () => undefined,
    },
    close: () => {},
  }
}
