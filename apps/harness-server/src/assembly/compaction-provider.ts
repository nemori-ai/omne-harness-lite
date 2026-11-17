import { createHash } from 'node:crypto'

export const DEFAULT_COMPACTION_BINDING = Object.freeze({
  authority: 'context-compaction/default',
  adoption: Object.freeze({
    owner: '@omne-harness/context-compaction',
    name: 'model-summary',
    revision: '1',
    digest: createHash('sha256')
      .update('model-summary/1:retain-16-percent:newest:paired:trim-tool-65536:attempts-3')
      .digest('hex'),
  }),
})
