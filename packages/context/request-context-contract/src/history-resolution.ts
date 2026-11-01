// The history evidence resolver: the port that turns the durable evidence of one history head into
// the history evidence of the second group (RQ-13). The history holder implements it. Types only.
import type { Access, DurableEvidence } from './refs.js'
import type { SourceRead } from './sources.js'
import type { HistoryEvidence } from './values.js'

/** One resolution: the access of this call and the durable evidence of a history head. */
export type HistoryResolution<P> = Readonly<{ access: Access<P>; evidence: DurableEvidence }>

/**
 * Resolves durable evidence to the target, epoch and upper bound that it names. The implementer
 * checks the current read eligibility of `access` on every call; evidence of another tenant answers
 * `denied`, never a value.
 */
export type HistoryEvidenceResolver<P> = (
  input: HistoryResolution<P>,
) => Promise<SourceRead<HistoryEvidence>>
