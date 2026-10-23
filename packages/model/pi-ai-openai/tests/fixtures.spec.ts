// The replay fixtures of the OpenAI family (#463 C1): every record has its fixture, the request
// fixture encodes to its body and the stream fixture decodes to the facts that the sealed tests
// expect, translated to contract facts. The extra cases each check one record.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeFamilies, defineFamily } from '@omne-harness/pi-ai-transport'
import { checkChatCompletionsFixtures } from '@omne-harness/pi-ai-transport/testing'
import { OPENAI_OWNER } from '@omne-harness/pi-ai-openai'
import {
  CASES_DIRECTORY,
  FIXTURES_ROOT,
  RECORDS_DIRECTORY,
  renderedCases,
} from './support/fixture-files.ts'
import { FAMILY, recordNamed } from './support/openai.ts'

const root = fileURLToPath(FIXTURES_ROOT)
const rendered = renderedCases()

/** A family with one record of the OpenAI family; its acquire is the acquire of the full family. */
function oneRecordFamily(name: string) {
  const contributions = composeFamilies([FAMILY])
  return defineFamily({
    owner: OPENAI_OWNER,
    records: [recordNamed(name)],
    acquire: (_record, supplier, signal) => contributions.acquire(supplier, signal),
  })
}

describe('the fixture files are the case table', () => {
  it.each(rendered.map(item => [item.directory, item] as const))('%s', (_directory, item) => {
    for (const [name, text] of Object.entries(item.files))
      expect(readFileSync(join(root, item.directory, name), 'utf8'), name).toBe(text)
  })

  it('every record has exactly one record fixture', () => {
    const records = rendered
      .filter(item => item.case.slot === 'record')
      .map(item => item.case.record)
    expect(new Set(records).size).toBe(records.length)
  })
})

describe('checkChatCompletionsFixtures', () => {
  it('the record fixtures of every record match the engine', async () => {
    const report = await checkChatCompletionsFixtures(FAMILY, join(root, RECORDS_DIRECTORY))
    expect(report.problems).toEqual([])
  })

  it.each(
    rendered.filter(item => item.case.slot === 'case').map(item => [item.case.id, item] as const),
  )('case %s matches the engine', async (_id, item) => {
    const report = await checkChatCompletionsFixtures(
      oneRecordFamily(item.case.record),
      join(root, item.root),
    )
    expect(report.problems).toEqual([])
  })

  it('no case directory is left without a case', () => {
    const ids = rendered.filter(item => item.case.slot === 'case').map(item => item.case.id)
    expect(readdirSync(join(root, CASES_DIRECTORY)).toSorted()).toEqual(ids.toSorted())
  })
})
