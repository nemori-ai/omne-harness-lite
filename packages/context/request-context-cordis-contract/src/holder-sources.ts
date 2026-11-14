import type {
  AdoptedRequestSource,
  ContextReadEligibility,
  HistoryEvidenceResolver,
  HistorySource,
  SourceSettlement,
} from '@omne-harness/request-context-contract'

export type ContextHolderParts<P> = Readonly<{
  history: HistorySource<P>
  adopted: AdoptedRequestSource<P>
  eligibility: ContextReadEligibility<P>
  resolveHistory: HistoryEvidenceResolver<P>
}>

export type LeaseSettlement = () => Promise<SourceSettlement>

export type ContextHolderLease<P> = Readonly<{
  parts: ContextHolderParts<P>
  release(): void
}>

export type ContextHolderLeaseResult<P> =
  | Readonly<{ kind: 'leased'; lease: ContextHolderLease<P> }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface ContextHolderSources<P> {
  lease(input: Readonly<{ settle: LeaseSettlement }>): ContextHolderLeaseResult<P>
}
