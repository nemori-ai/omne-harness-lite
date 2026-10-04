import type { AtomicStorage } from './protocol.ts'
/** Trusted assembly borrow. Physical close remains with the application owner. */
export interface StorageOwnerOperations {
  readonly borrow: () => { readonly storage: AtomicStorage; readonly release: () => Promise<void> }
}
