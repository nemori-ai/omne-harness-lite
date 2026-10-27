import type { ContentBlock } from '@omne-harness/content-block'
import type { Access, AgentExecutionId, DurableEvidence } from './identity.ts'
import type { ExecutionMutation } from './execution.ts'
import type { AgentJournal } from './journal.ts'
import type { AgentMaterials, Material } from './passages.ts'
import type { AgentJournalEntries, AgentReceivedCommits, ReceivedCommitInput } from './receiving.ts'

/** Public observations plus explicit test-only binding and fault controls of one provider. */
export interface ReceivedCommitFixture<P, B extends ContentBlock> {
  readonly entries: AgentJournalEntries<P>
  readonly received: AgentReceivedCommits<P, B>
  readonly materials: AgentMaterials<P, B>
  readonly journal: Pick<AgentJournal<P>, 'query'>
  /** Register the original frozen consumption and payload independently of commit. */
  bind(input: ReceivedCommitInput<P, B>): Promise<void>
  /** An immutable sample payload, appropriate for the provider's material support. */
  material(name: string): Material<B>
  inspect(
    access: Access<P>,
    execution: AgentExecutionId,
  ): Promise<
    Readonly<{
      revision: number
      materials: number
      entries: number
    }>
  >
  /** Pause before publication; source is a test probe, never a public prepared result. */
  pause(input: ExecutionMutation<P>): Readonly<{
    reached: Promise<DurableEvidence>
    release(): void
  }>
  fault(input: ExecutionMutation<P>, point: 'before-publish' | 'after-publish'): void
  /** Install independently established authoritative exclusion, including against a paused write. */
  exclude(input: ReceivedCommitInput<P, B>, evidence: DurableEvidence): Promise<void>
  /** Model current qualification, checked before recognition and query. */
  qualify(
    access: Access<P>,
    execution: AgentExecutionId,
    status: 'allowed' | 'denied' | 'unavailable',
  ): void
  /** Restore only an original saved record, or remove material, to exercise legacy recovery. */
  retainSaved(input: ExecutionMutation<P>, saved: DurableEvidence): void
  loseMaterial(source: DurableEvidence): void
}

export type RequiredReceivedCommits<P, B extends ContentBlock> = Readonly<{
  received: 'required'
  joint: ReceivedCommitFixture<P, B>
}>
