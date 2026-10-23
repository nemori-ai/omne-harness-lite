// Appends a fingerprint line for every record without one. Run with `pnpm run fingerprints` after
// adding a record; it refuses to change the line of an existing record.
import { fileURLToPath } from 'node:url'
import { appendAdoptionFingerprints } from '@omne-harness/pi-ai-transport/testing'
import { FAMILY } from './anthropic.ts'

const file = fileURLToPath(new URL('../fixtures/adoptions.json', import.meta.url))
const added = await appendAdoptionFingerprints(FAMILY, file)
process.stdout.write(`added ${added.length} fingerprint lines\n`)
