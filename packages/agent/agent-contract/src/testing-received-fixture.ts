import type { ContentBlock } from '@omne-harness/content-block'
import type { Access, AgentExecutionId, DurableEvidence } from './identity.ts'
import type { ExecutionMutation } from './execution.ts'
import type { AgentJournal } from './journal.ts'
import type { AgentMaterials, Material } from './passages.ts'
import type { AgentJournalEntries, AgentReceivedCommits, ReceivedCommitInput } from './receiving.ts'

export interface ReceivedCommitFixture<P, B extends ContentBlock> {
  readonly entries: AgentJournalEntries<P>
  readonly received: AgentReceivedCommits<P, B>
  readonly materials: AgentMaterials<P, B>
  readonly journal: Pick<AgentJournal<P>, 'query'>
  bind(input: ReceivedCommitInput<P, B>): Promise<void>
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
  pause(input: ExecutionMutation<P>): Readonly<{
    reached: Promise<DurableEvidence>
    release(): void
  }>
  fault(input: ExecutionMutation<P>, point: 'before-publish' | 'after-publish'): void
  exclude(input: ReceivedCommitInput<P, B>, evidence: DurableEvidence): Promise<void>
  qualify(
    access: Access<P>,
    execution: AgentExecutionId,
    status: 'allowed' | 'denied' | 'unavailable',
  ): void
  retainSaved(input: ExecutionMutation<P>, saved: DurableEvidence): void
  loseMaterial(source: DurableEvidence): void
}

export type RequiredReceivedCommits<P, B extends ContentBlock> = Readonly<{
  received: 'required'
  joint: ReceivedCommitFixture<P, B>
}>
