// The holder sources protocol: the parts that a source holder lends to a borrower that registers
// source sets (RQ-12), and the lease that keeps the lent reads open until the borrower has settled.
// Settlement is pulled: the borrower gives a settlement function when it takes the lease, and the
// holder calls it when the lease ends, by release or by the unload of the borrower fiber. Types
// only; the Cordis definition is in cordis.ts.
import type {
  AdoptedRequestSource,
  ContextReadEligibility,
  HistoryEvidenceResolver,
  HistorySource,
  SourceSettlement,
} from '@omne-harness/request-context-contract'

/** The four reads a borrower puts into the source sets it registers. Each read checks the access of every call. */
export type ContextHolderParts<P> = Readonly<{
  history: HistorySource<P>
  adopted: AdoptedRequestSource<P>
  eligibility: ContextReadEligibility<P>
  resolveHistory: HistoryEvidenceResolver<P>
}>

/**
 * Given by the borrower when it takes a lease. The holder calls it once, when the lease ends. It ends
 * after every source set that the borrower registered with the leased parts has settled.
 */
export type LeaseSettlement = () => Promise<SourceSettlement>

export type ContextHolderLease<P> = Readonly<{
  parts: ContextHolderParts<P>
  /**
   * Ends the lease. A second call does nothing. When it returns, the holder has called the
   * settlement function. The parts keep answering until the holder closes its reads.
   */
  release(): void
}>

export type ContextHolderLeaseResult<P> =
  | Readonly<{ kind: 'leased'; lease: ContextHolderLease<P> }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * A source holder that lends its reads. The holder closes a lent read only after every lease has
 * ended and every settlement it obtained has ended.
 */
export interface ContextHolderSources<P> {
  lease(input: Readonly<{ settle: LeaseSettlement }>): ContextHolderLeaseResult<P>
}
