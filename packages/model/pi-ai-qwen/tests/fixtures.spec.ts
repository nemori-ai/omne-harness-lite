import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RECORD_FACTS } from '@omne-harness/pi-ai-transport'
import { checkRecordFixtures } from '@omne-harness/pi-ai-transport/testing'
import { FAMILY, RECORD } from './support/qwen.ts'

const RECORDS = fileURLToPath(new URL('fixtures/records/', import.meta.url))
const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url))

describe('the stream captured from the real gateway', () => {
  it('the request encodes to the body that was sent, and the stream decodes to facts.json', async () => {
    const report = await checkRecordFixtures(FAMILY, RECORDS)
    expect(report.problems).toEqual([])
  })

  it('is the file every fact of the record cites', () => {
    for (const fact of RECORD_FACTS) {
      const source = RECORD.provenance[fact]
      expect(existsSync(join(REPOSITORY, source.evidence)), `${fact}: ${source.evidence}`).toBe(
        true,
      )
    }
  })
})
