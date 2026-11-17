import { createHash } from 'node:crypto'
import { compactionInputText, type CompactionInput } from '@omne-harness/agent-contract'
import {
  sampleCompactionInput,
  sampleCompactionAdoption,
} from '@omne-harness/agent-contract/testing'
import { evidence } from '../journal-support.ts'
export { sampleCompactionInput as compactionInput, sampleCompactionAdoption as compactionAdoption }
export function compactionInputRef(input: CompactionInput) {
  return {
    source: evidence('frozen-input'),
    schema: sampleCompactionAdoption,
    digest: `sha256:${createHash('sha256').update(compactionInputText(input)).digest('hex')}`,
  }
}
