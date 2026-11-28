import { fingerprintConfig, writeFingerprints } from '@omne-harness/pi-ai-transport/testing'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { createGlmFamily } from '../../src/index.ts'

// The fingerprints come from the records alone; this family never acquires a binding.
const family = createGlmFamily(fingerprintConfig(openAiTokenizerResources()))
await writeFingerprints(family, new URL('../fixtures/adoptions.json', import.meta.url))
