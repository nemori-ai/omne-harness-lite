import { fileURLToPath } from 'node:url'
import { appendAdoptionFingerprints } from '@omne-harness/pi-ai-transport/testing'
import { FAMILY } from './anthropic.ts'

const file = fileURLToPath(new URL('../fixtures/adoptions.json', import.meta.url))
const added = await appendAdoptionFingerprints(FAMILY, file)
process.stdout.write(`added ${added.length} fingerprint lines\n`)
