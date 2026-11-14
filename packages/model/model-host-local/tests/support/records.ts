import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type FixedModelRequest } from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'

export type FamilyName = 'pi-ai-openai' | 'pi-ai-anthropic'

export type RecordFixture = Readonly<{
  request: FixedModelRequest
  requestJson: unknown
  stream: string
}>

type RecordHead = Parameters<typeof fixtureDirectory>[0]

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
