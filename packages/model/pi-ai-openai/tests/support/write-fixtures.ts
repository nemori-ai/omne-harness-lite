import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  CASES_DIRECTORY,
  FIXTURES_ROOT,
  RECORDS_DIRECTORY,
  renderedCases,
} from './fixture-files.ts'

// The records on the Responses interface keep the streams captured from the gateway
// (tests/live/capture-records.ts); only the directories of the cases written here are replaced.
const root = fileURLToPath(FIXTURES_ROOT)
const rendered = renderedCases()
rmSync(join(root, CASES_DIRECTORY), { recursive: true, force: true })
for (const item of rendered)
  if (item.case.slot === 'record')
    rmSync(join(root, RECORDS_DIRECTORY, encodeURIComponent(item.case.record)), {
      recursive: true,
      force: true,
    })
for (const item of rendered) {
  const directory = join(root, item.directory)
  mkdirSync(directory, { recursive: true })
  for (const [name, text] of Object.entries(item.files)) writeFileSync(join(directory, name), text)
}
