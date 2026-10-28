// Test support: the record fixtures of the two pi families, read through the declared dev
// dependencies. The request is judged by the contract, so its identities are real; the stream is
// the SSE body that the family's own fixture check decodes into its facts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type FixedModelRequest } from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'

export type FamilyName = 'pi-ai-openai' | 'pi-ai-anthropic'

export type RecordFixture = Readonly<{
  request: FixedModelRequest
  /** The request as plain JSON, before the judge: a test builds the next request from it. */
  requestJson: unknown
  /** The SSE body the gateway answered with. */
  stream: string
}>

type RecordHead = Parameters<typeof fixtureDirectory>[0]

/**
 * The SSE body of the family's stream captured from the real gateway for `record`, byte for byte:
 * `tests/fixtures/captured` of the family package.
 */
export function readCapturedStream(family: FamilyName, record: RecordHead): Buffer {
  const root = fileURLToPath(
    new URL(`../../node_modules/@omne-harness/${family}/tests/fixtures/captured/`, import.meta.url),
  )
  return readFileSync(join(root, fixtureDirectory(record), 'stream.sse'))
}

export function readRecordFixture(family: FamilyName, record: RecordHead): RecordFixture {
  const root = fileURLToPath(
    new URL(`../../node_modules/@omne-harness/${family}/tests/fixtures/records/`, import.meta.url),
  )
  const directory = join(root, fixtureDirectory(record))
  const parsed: unknown = JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8'))
  const requestJson: unknown = Reflect.get(Object(parsed), 'request')
  const judged = judgeFixedModelRequest(requestJson)
  if (!('ok' in judged)) throw new Error(`${record.name}: ${JSON.stringify(judged.failure)}`)
  return {
    request: judged.ok,
    requestJson,
    stream: readFileSync(join(directory, 'stream.sse'), 'utf8'),
  }
}
