import type { Access, DurableEvidence } from './refs.js'
import type { SourceRead } from './sources.js'
import type { HistoryEvidence } from './values.js'

export type HistoryResolution<P> = Readonly<{ access: Access<P>; evidence: DurableEvidence }>

export type HistoryEvidenceResolver<P> = (
  input: HistoryResolution<P>,
) => Promise<SourceRead<HistoryEvidence>>
