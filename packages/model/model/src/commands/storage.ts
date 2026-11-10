import type { Outcome } from '@omne-harness/operation-result'
import type {
  FixedModelRequest,
  ModelCallId,
  ModelFailure,
  ModelOperationId,
} from '@omne-harness/model-contract'
import type { BindingBase, CallDocument, TenantDocuments } from './types.ts'

/**
 * One write that a command attempt asks the storage to make.
 *
 * `expected` is the call document that the attempt read, or `undefined` when the call did not
 * exist. The storage writes only while that read is still current: this is the `row_version`
 * comparison of a durable storage. `call` is the new document. `binding` binds `operation` to
 * the call, method, fingerprint, revision and receipt of this write.
 *
 * `body` is the whole fixed request. It is present exactly when the write admits the call. The
 * call document keeps only the head of the request; the storage keeps the body once, apart from
 * the document. A body has no size bound, so a durable storage writes it in its own steps before
 * the write of the call, and the call then holds only when its body is whole. The storage deletes
 * a body that no call came to own, and the body of a call in the step that releases its material.
 */
export type CommandWrite = Readonly<{
  operation: ModelOperationId
  expected: CallDocument | undefined
  call: CallDocument | undefined
  binding: BindingBase
  body?: FixedModelRequest
}>

/**
 * What a command attempt is about, for a storage that reads before it runs `work`. `tenant` is the
 * canonical tenant text. `call` and `operation` are present when the command names them. A storage
 * that needs no pre-read ignores the scope.
 */
export type RunScope = Readonly<{
  tenant: string
  call?: ModelCallId
  operation?: ModelOperationId
}>

/** One page of the calls of a tenant that owe recovery work, and the cursor of the next page. */
export type PendingPage = Readonly<{ calls: readonly ModelCallId[]; next: string | null }>

/**
 * The storage of the shared commands core. The core does no I/O and keeps no state outside the
 * process: it reads and writes call documents and operation bindings only through this port.
 * `tenant` is the canonical tenant text (`tenantCodec`).
 */
export interface ModelCommandStorage {
  /**
   * Runs one command attempt. `work` is synchronous: it reads documents, calls the ports of the
   * core and asks for at most one `commit`. The storage lets one attempt run at a time. `scope`
   * names the tenant, call and operation of the attempt, so a durable storage can read them before
   * it runs `work`.
   */
  run<T>(work: () => Outcome<T, ModelFailure>, scope?: RunScope): Promise<Outcome<T, ModelFailure>>
  /** The calls and operation bindings of one tenant. A tenant without documents reads empty. */
  documents(tenant: string): TenantDocuments
  /** How many admitted calls hold a result that is not released. The storage decides the scope. */
  held(): number
  /** The whole request of the call that holds its material; null when the storage keeps none. */
  readBody(
    tenant: string,
    call: ModelCallId,
  ): Promise<Outcome<FixedModelRequest | null, ModelFailure>>
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
  /**
   * Optional. One page of the calls of `tenant` that owe recovery work, in call order, after the
   * cursor `after` that an earlier page gave (`null` for the first page), at most `limit` calls.
   * The selection is the one `scanPending` makes over `documents`: a call for which
   * `hasRecoveryWork` holds, or that has an operation with an unknown outcome. A storage that
   * cannot hold every call of a tenant in `documents` provides it; `scanPending` then pages
   * through it and never runs an attempt. A cursor the storage did not give answers
   * `invalid('after', 'scan-cursor')`.
   */
  pending?(
    tenant: string,
    after: string | null,
    limit: number,
  ): Promise<Outcome<PendingPage, ModelFailure>>
}
