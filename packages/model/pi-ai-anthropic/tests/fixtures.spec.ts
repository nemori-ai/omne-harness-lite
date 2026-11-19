import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RECORD_FACTS } from '@omne-harness/pi-ai-transport'
import { checkRecordFixtures } from '@omne-harness/pi-ai-transport/testing'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { FIXTURES_ROOT, RECORDS_DIRECTORY } from './support/fixture-files.ts'
import { FAMILY } from './support/anthropic.ts'

const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url))

describe('the record fixtures', () => {
  it('each current record has one fixture, captured from the gateway, that the engine reproduces', async () => {
    const report = await checkRecordFixtures(
      FAMILY,
      join(fileURLToPath(FIXTURES_ROOT), RECORDS_DIRECTORY),
    )
    expect(report.problems).toEqual([])
  })
})

describe('the sources of the adaptation facts', () => {
  it.each(ANTHROPIC_RECORDS.map(record => [record.name, record] as const))(
    '%s cites an existing file for every fact',
    (_name, record) => {
      for (const fact of RECORD_FACTS) {
        const source = record.provenance[fact]
        expect(source.measuredAt, fact).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(existsSync(join(REPOSITORY, source.evidence)), `${fact}: ${source.evidence}`).toBe(
          true,
        )
      }
    },
  )
})
