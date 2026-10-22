// The committed adoption fingerprints: one line per record, compared both ways. A record changed
// in place without a new revision fails here; `pnpm run fingerprints` only appends.
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { checkAdoptionFingerprints } from '@omne-harness/pi-ai-transport/testing'
import { FAMILY } from './support/openai.ts'

it('tests/fixtures/adoptions.json matches the records both ways', async () => {
  const file = fileURLToPath(new URL('fixtures/adoptions.json', import.meta.url))
  expect(await checkAdoptionFingerprints(FAMILY, file)).toEqual({ problems: [] })
})
