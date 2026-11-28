import { fingerprintConfig, writeFingerprints } from '@omne-harness/pi-ai-transport/testing'
import { createAnthropicFamily, anthropicTokenizerResources } from '../../src/index.ts'

// The fingerprints come from the records alone; this family never acquires a binding.
const family = createAnthropicFamily(fingerprintConfig(anthropicTokenizerResources()))
await writeFingerprints(family, new URL('../fixtures/adoptions.json', import.meta.url))
