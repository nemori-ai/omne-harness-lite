import { fileURLToPath } from 'node:url'
import { appendAdoptionFingerprints } from '@omne-harness/pi-ai-transport/testing'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { createQwenFamily } from '../../src/family.ts'

// The fingerprints come from the records alone; this family never acquires a binding.
const family = createQwenFamily({
  tokenizer: openAiTokenizerResources(),
  executor: { acquire: () => ({ failure: { kind: 'unavailable', diagnostic: 'not-used' } }) },
  limits: {
    toolArguments: {
      maxBytes: 1,
      maxDepth: 1,
      maxItems: 1,
      maxMembers: 1,
      maxStringLength: 1,
      maxNumberLength: 1,
    },
    maxReasoningText: 1,
  },
  margin: {
    percent: '0',
    source: { owner: 'fingerprints', name: 'none', revision: '1', digest: '0' },
  },
})
const file = fileURLToPath(new URL('../fixtures/adoptions.json', import.meta.url))
const added = await appendAdoptionFingerprints(family, file)
process.stdout.write(`added ${added.length} fingerprint lines\n`)
