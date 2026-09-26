import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll } from 'vitest'
import { describeStorageConformance } from '@omne-harness-lite/storage/conformance'
import { createSqliteConformanceFixture } from '../src/storage-fixture.ts'

const directory = process.env.OMNE_CONFORMANCE_DIRECTORY
const mode = process.env.OMNE_CONFORMANCE_FOREIGN_KEYS
if (directory === undefined || (mode !== 'enabled' && mode !== 'disabled'))
  throw new Error('conformance fixture requires an owned directory and explicit foreign-key mode')

const fixture = createSqliteConformanceFixture(directory, mode)
describeStorageConformance('sqlite (public provider)', fixture.open)

afterAll(async () => {
  try {
    await fixture.close()
  } finally {
    await writeFile(
      join(directory, 'fixture.json'),
      JSON.stringify({ mode, ...fixture.observations() }, null, 2),
    )
  }
})
