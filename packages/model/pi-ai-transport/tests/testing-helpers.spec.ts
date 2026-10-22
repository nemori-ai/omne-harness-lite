// The `./testing` entry: the fixture check and the adoption fingerprints, with a tiny family of
// engine-test records in a temporary directory.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonText } from '@omne-harness/json-text'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bindChatCompletions, type ChatCompletionsRecord } from '../src/chat-completions/index.ts'
import { defineFamily, type PiFamily } from '../src/index.ts'
import {
  appendAdoptionFingerprints,
  checkAdoptionFingerprints,
  checkChatCompletionsFixtures,
  fixtureDirectory,
  renderFingerprints,
} from '../src/testing/index.ts'
import { replayStream } from '../src/testing/fixtures.ts'
import {
  LIMITS,
  OWNER,
  engineProbe,
  fixedRequest,
  supplierOf,
  testHooks,
  testMeter,
  testRecord,
} from './support/chat-record.ts'

const RECORDS: readonly ChatCompletionsRecord[] = [
  testRecord(),
  testRecord({ name: 'lab/model-b', route: { recipient: 'gateway', model: 'lab/model-b' } }),
]

function family(records: readonly ChatCompletionsRecord[] = RECORDS): PiFamily {
  return defineFamily({
    owner: OWNER,
    records,
    async acquire(record, supplier) {
      const probe = engineProbe()
      return {
        ok: bindChatCompletions({
          record,
          supplier,
          hooks: testHooks(probe),
          meter: testMeter(record, probe),
          limits: LIMITS,
          release: async () => undefined,
        }),
      }
    },
  })
}

const STREAM = [
  'data: {"model":"m","provider":"Lab","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
  'data: {"model":"m","provider":"Lab","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  'data: [DONE]',
  '',
].join('\n\n')

let root: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pi-ai-transport-fixtures-')))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Writes the three fixture files of a record whose expectations match the engine. */
async function writeFixture(record: ChatCompletionsRecord): Promise<string> {
  const directory = join(root, fixtureDirectory(record))
  mkdirSync(directory, { recursive: true })
  const request = fixedRequest(record)
  const probe = engineProbe()
  const binding = bindChatCompletions({
    record,
    supplier: supplierOf(record),
    hooks: testHooks(probe),
    meter: testMeter(record, probe),
    limits: LIMITS,
    release: async () => undefined,
  })
  const encoded = binding.encode({ request, media: [] })
  if (!('ok' in encoded)) throw new Error('encode')
  const body: unknown = JSON.parse(writeJsonText(encoded.ok.body))
  writeFileSync(join(directory, 'request.json'), JSON.stringify({ request, body }, null, 2))
  writeFileSync(join(directory, 'stream.sse'), STREAM)
  const facts = await replayStream(binding, new TextEncoder().encode(STREAM))
  writeFileSync(join(directory, 'facts.json'), JSON.stringify(facts, null, 2))
  return directory
}

async function writeAll(): Promise<void> {
  for (const record of RECORDS) await writeFixture(record)
}

describe('checkChatCompletionsFixtures', () => {
  it('passes when every record has matching fixtures; a / in a name stays in one directory', async () => {
    await writeAll()
    expect(fixtureDirectory(RECORDS[1] ?? testRecord())).toBe(join('lab%2Fmodel-b', '1'))
    expect(await checkChatCompletionsFixtures(family(), root)).toEqual({ problems: [] })
  })

  it('reports a record without its directory or one of its files', async () => {
    await writeAll()
    rmSync(join(root, fixtureDirectory(testRecord()), 'facts.json'))
    rmSync(join(root, 'lab%2Fmodel-b'), { recursive: true })
    const { problems } = await checkChatCompletionsFixtures(family(), root)
    expect(problems).toEqual([
      'model-a/1: missing facts.json',
      'lab/model-b/1: missing request.json',
      'lab/model-b/1: missing stream.sse',
      'lab/model-b/1: missing facts.json',
    ])
  })

  it('reports directories that name no record', async () => {
    await writeAll()
    mkdirSync(join(root, 'model-a', '2'))
    mkdirSync(join(root, 'gone', '1'), { recursive: true })
    const { problems } = await checkChatCompletionsFixtures(family(), root)
    expect(problems).toEqual([
      'extra directory gone: no record has this name',
      `extra directory ${join('model-a', '2')}: no record has this revision`,
    ])
  })

  it('reports an encoded body or a fact sequence that differs from its fixture', async () => {
    const directory = await writeFixture(testRecord())
    await writeFixture(RECORDS[1] ?? testRecord())
    const requestFile = join(directory, 'request.json')
    const request: unknown = JSON.parse(readFileSync(requestFile, 'utf8'))
    if (typeof request !== 'object' || request === null) throw new Error('request.json')
    writeFileSync(requestFile, JSON.stringify({ ...request, body: { model: 'other' } }))
    writeFileSync(join(directory, 'facts.json'), '[]')
    const { problems } = await checkChatCompletionsFixtures(family(), root)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^model-a\/1: the encoded body differs from request.json body/)
    expect(problems[1]).toMatch(/^model-a\/1: the facts of stream.sse differ from facts.json/)
  })

  it('reports a request.json without the two members or with a refused request', async () => {
    const directory = await writeFixture(testRecord())
    await writeFixture(RECORDS[1] ?? testRecord())
    writeFileSync(join(directory, 'request.json'), '{"request":{},"body":{}}')
    const { problems } = await checkChatCompletionsFixtures(family(), root)
    expect(problems).toEqual([
      expect.stringMatching(/^model-a\/1: request.json: the contract refuses/),
    ])
  })
})

describe('adoption fingerprints', () => {
  const file = () => join(root, 'adoptions.json')

  it('the generator creates the file, the check passes, and a second run adds nothing', async () => {
    expect(await checkAdoptionFingerprints(family(), file())).toEqual({
      problems: [`missing fingerprint file ${file()}`],
    })
    const added = await appendAdoptionFingerprints(family(), file())
    expect(added.map(line => line.name)).toEqual(['model-a', 'lab/model-b'])
    expect(readFileSync(file(), 'utf8')).toBe(renderFingerprints(added))
    expect(await checkAdoptionFingerprints(family(), file())).toEqual({ problems: [] })
    expect(await appendAdoptionFingerprints(family(), file())).toEqual([])
  })

  it('only appends: a new record adds a line after the existing ones', async () => {
    await appendAdoptionFingerprints(family([testRecord()]), file())
    const before = readFileSync(file(), 'utf8')
    await appendAdoptionFingerprints(family(), file())
    const after = readFileSync(file(), 'utf8')
    const earlier: unknown = JSON.parse(before)
    const later: unknown = JSON.parse(after)
    if (!Array.isArray(earlier) || !Array.isArray(later)) throw new Error('fingerprint file')
    expect(later.slice(0, earlier.length)).toEqual(earlier)
    expect(later.slice(earlier.length)).toEqual([expect.objectContaining({ name: 'lab/model-b' })])
  })

  it('a record changed in place fails the check, and the generator refuses to change its line', async () => {
    await appendAdoptionFingerprints(family(), file())
    const before = readFileSync(file(), 'utf8')
    const changed = [testRecord({ status: 'frozen' }), RECORDS[1] ?? testRecord()]
    const { problems } = await checkAdoptionFingerprints(family(changed), file())
    expect(problems).toEqual([
      expect.stringMatching(/^model-a\/1: the record digest .* differs from the line/),
    ])
    await expect(appendAdoptionFingerprints(family(changed), file())).rejects.toThrow(RangeError)
    expect(readFileSync(file(), 'utf8')).toBe(before)
  })

  it('reports a line that names no record and a file that is not in its rendered form', async () => {
    await appendAdoptionFingerprints(family(), file())
    expect((await checkAdoptionFingerprints(family([testRecord()]), file())).problems).toEqual([
      'lab/model-b/1: the line names no record',
    ])
    writeFileSync(file(), JSON.stringify([{ name: 'model-a', revision: '1', digest: 'x' }]))
    expect((await checkAdoptionFingerprints(family(), file())).problems).toEqual([
      'the fingerprint file is not in its rendered form (see renderFingerprints)',
    ])
    await expect(appendAdoptionFingerprints(family(), file())).rejects.toThrow(RangeError)
  })
})
