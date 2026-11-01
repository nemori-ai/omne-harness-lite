import type { Outcome } from '@omne-harness/operation-result'
import type { ModelFailure, ModelOperationId, ResultCapacity } from '@omne-harness/model-contract'
import type { BindingBase, CallDocument, TenantDocuments } from './types.ts'

/**
 * One write that a command attempt asks the storage to make.
 *
 * `expected` is the call document that the attempt read, or `undefined` when the call did not
 * exist. The storage writes only while that read is still current: this is the `row_version`
 * comparison of a durable storage. `call` is the new document. `binding` binds `operation` to
 * the call, method, fingerprint, revision and receipt of this write.
 */
export type CommandWrite = Readonly<{
  operation: ModelOperationId
  expected: CallDocument | undefined
  call: CallDocument | undefined
  binding: BindingBase
}>

/**
 * The storage of the shared commands core. The core does no I/O and keeps no state outside the
 * process: it reads and writes call documents and operation bindings only through this port.
 * `tenant` is the canonical tenant text (`tenantCodec`).
 */
export interface ModelCommandStorage {
  /**
   * Runs one command attempt. `work` is synchronous: it reads documents, calls the ports of the
   * core and asks for at most one `commit`. The storage lets one attempt run at a time.
   */
  run<T>(work: () => Outcome<T, ModelFailure>): Promise<Outcome<T, ModelFailure>>
  /** The calls and operation bindings of one tenant. A tenant without documents reads empty. */
  documents(tenant: string): TenantDocuments
  /** The capacity that admitted, unreleased calls hold. The storage decides the scope of the sum. */
  reserved(field: keyof ResultCapacity): bigint
  /**
   * Writes the call and binds the operation in one step. `committed`: both hold. `unknown`: the
   * storage cannot tell whether the write holds; it keeps the binding as unresolved.
   */
  commit(tenant: string, write: CommandWrite): 'committed' | 'unknown'
  /**
   * Replaces one call document without an operation binding. The core uses it only for the
   * progress of a read relation, which the result consumer drives without an operation.
   */
  publish(tenant: string, call: CallDocument): void
}
