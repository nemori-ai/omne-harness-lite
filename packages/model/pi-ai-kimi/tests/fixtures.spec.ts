import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RECORD_FACTS } from '@omne-harness/pi-ai-transport'
import { checkRecordFixtures } from '@omne-harness/pi-ai-transport/testing'
import { KIMI_RECORDS } from '@omne-harness/pi-ai-kimi'
import { FAMILY } from './support/kimi.ts'

const RECORDS = fileURLToPath(new URL('fixtures/records/', import.meta.url))
const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url))

describe('the stream captured from the real gateway', () => {
  it('the request encodes to the body that was sent, and the stream decodes to facts.json', async () => {
    const report = await checkRecordFixtures(FAMILY, RECORDS)
    expect(report.problems).toEqual([])
  })

  it.each(KIMI_RECORDS)('has evidence for every fact of $name', record => {
    for (const fact of RECORD_FACTS) {
      const source = record.provenance[fact]
      expect(existsSync(join(REPOSITORY, source.evidence)), `${fact}: ${source.evidence}`).toBe(
        true,
      )
    }
  })
})
