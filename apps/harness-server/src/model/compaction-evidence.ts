import { Service, type Context } from '@deepseek-ai/cordis'
import type { DefaultCompactionExecutor } from '@omne-harness/context-compaction'

export class CompactionModelEvidence extends Service {
  static readonly provide = 'compactionModelEvidence'
  readonly verify: DefaultCompactionExecutor<unknown>['verifyCompletion']
  constructor(ctx: Context, executor: DefaultCompactionExecutor<unknown>) {
    super(ctx, CompactionModelEvidence.provide)
    this.verify = executor.verifyCompletion
  }
}
export const compactionModelEvidenceKey = CompactionModelEvidence.provide
export function compactionEvidenceOf(ctx: Context): CompactionModelEvidence | undefined {
  return ctx.get(compactionModelEvidenceKey) as CompactionModelEvidence | undefined
}
