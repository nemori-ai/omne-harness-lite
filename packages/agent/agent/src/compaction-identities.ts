import { createHash } from 'node:crypto'
import { decodeAgentOperationId, type CompactionTaskIdentity } from '@omne-harness/agent-contract'
import { canonical } from './canonical.ts'

export function compactionOperation(task: CompactionTaskIdentity, stage: string) {
  const digest = createHash('sha256')
    .update(canonical([task, stage]))
    .digest('hex')
  const result = decodeAgentOperationId(`compaction/sha256:${digest}`)
  if ('failure' in result) throw new Error('derived compaction operation is invalid')
  return result.ok
}
