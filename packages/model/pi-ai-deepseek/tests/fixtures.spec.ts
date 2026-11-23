import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { RECORD_FACTS } from '@omne-harness/pi-ai-transport'
import {
  checkAdoptionFingerprints,
  checkRecordFixtures,
} from '@omne-harness/pi-ai-transport/testing'
import { DEEPSEEK_RECORDS } from '@omne-harness/pi-ai-deepseek'
import { FAMILY } from './support/deepseek.ts'

const fixtures = fileURLToPath(new URL('fixtures/', import.meta.url))
const repository = fileURLToPath(new URL('../../../../', import.meta.url))

it('binds the recorded requests and decodes every captured stream', async () => {
  expect((await checkRecordFixtures(FAMILY, join(fixtures, 'records'))).problems).toEqual([])
})
it('tracks the exact set of current record fingerprints', async () => {
  expect(
    (await checkAdoptionFingerprints(FAMILY, join(fixtures, 'adoptions.json'))).problems,
  ).toEqual([])
})
it.each(DEEPSEEK_RECORDS)('cites the measurements for $name', record => {
  for (const fact of RECORD_FACTS)
    expect(existsSync(join(repository, record.provenance[fact].evidence)), fact).toBe(true)
})

it.each(DEEPSEEK_RECORDS)('pins $name and advertises the choices its endpoint honored', record => {
  const observations = JSON.parse(
    readFileSync(join(repository, record.provenance.engine.evidence), 'utf8'),
  )
  expect(observations.model).toBe(record.name)
  expect(record.serving.order).toEqual([observations.pin])
  expect(record.serving.reports).toContain(observations.samples.tool.provider)
  expect(observations.samples.tool.upstreamModel).toBe(record.route.model)
  expect(observations.samples.continuation.answer).toContain('SAPPHIRE-614')
  for (const [sample, declared] of [
    ['tool-required', record.accepts?.forcedToolChoice],
    ['tool-named', record.accepts?.namedToolChoice],
  ] as const) {
    const exchange = observations.samples[sample]
    expect(exchange, sample).toBeDefined()
    const honored =
      exchange.status === 200 &&
      exchange.finish === 'tool_calls' &&
      exchange.tool === 'read_ticket' &&
      JSON.parse(exchange.arguments).id === 'A17'
    expect(declared, sample).toBe(honored)
  }
})
