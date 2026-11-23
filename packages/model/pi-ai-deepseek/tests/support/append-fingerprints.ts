import { fileURLToPath } from 'node:url'
import { appendAdoptionFingerprints } from '@omne-harness/pi-ai-transport/testing'
import { openTestFamily } from './family-config.ts'

const { family, close } = await openTestFamily()
try {
  const file = fileURLToPath(new URL('../fixtures/adoptions.json', import.meta.url))
  const added = await appendAdoptionFingerprints(family, file)
  console.log('Added fingerprints:', added.length)
} finally {
  await close()
}
