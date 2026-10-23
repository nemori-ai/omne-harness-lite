// Writes tests/fixtures/records and tests/fixtures/cases from the case table. Run with
// `pnpm run fixtures` after a change of the table; the fixture test fails until the files match.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  CASES_DIRECTORY,
  FIXTURES_ROOT,
  RECORDS_DIRECTORY,
  renderedCases,
} from './fixture-files.ts'

const root = fileURLToPath(FIXTURES_ROOT)
for (const directory of [RECORDS_DIRECTORY, CASES_DIRECTORY])
  rmSync(join(root, directory), { recursive: true, force: true })
for (const rendered of renderedCases()) {
  const directory = join(root, rendered.directory)
  mkdirSync(directory, { recursive: true })
  for (const [name, text] of Object.entries(rendered.files))
    writeFileSync(join(directory, name), text)
}
