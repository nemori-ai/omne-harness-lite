// The fixture check of a gateway-engine family: for every record, the request fixture encodes to
// its expected body and the stream fixture decodes to its expected facts, through the binding
// that the family gives for the record and the same body decoding that a send uses.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  judgeFixedModelRequest,
  type Adoption,
  type Supplier,
  type TransportFact,
} from '@omne-harness/model-contract'
import { sorted } from '../chat-completions/json.ts'
import { decodeBody, type Progress } from '../fact-stream.ts'
import { composeFamilies, familyRecords, type PiFamily } from '../family-table.ts'
import type { PiFamilyBinding } from '../family.ts'
import { terminationOf } from '../termination.ts'

/** The data text of the SSE event that ends a gateway stream. */
export const GATEWAY_END_MARKER = '[DONE]'

/** The three files of the fixture directory of one record. */
export const FIXTURE_FILES = ['request.json', 'stream.sse', 'facts.json'] as const

export type FixtureReport = Readonly<{ problems: readonly string[] }>

/**
 * The directory of one record below the fixture root: `<name>/<revision>`, each segment
 * percent-encoded with `encodeURIComponent`, so a `/` in a name stays inside one segment.
 */
export function fixtureDirectory(record: Readonly<{ name: string; revision: string }>): string {
  return join(encodeURIComponent(record.name), encodeURIComponent(record.revision))
}

/**
 * Checks the fixtures of every record of the family, `current` and `frozen`. The record list of
 * the family is the only list. Reports, one line each:
 *
 * - a record without its directory or without one of its three files;
 * - a `request.json` that is not `{ "request": <FixedModelRequest>, "body": <JSON> }`;
 * - an encode that fails or whose body differs from `body`;
 * - a `stream.sse` whose facts, `ended` included, differ from `facts.json`;
 * - a directory below the root, or below a name directory, that names no record.
 *
 * The binding comes from the family through `composeFamilies` with a factory supplier and is
 * released after the check. The stream fixture is read whole; the SSE and JSON budgets of the
 * replay are the size of the file, so a fixture is never cut by a limit.
 */
export async function checkChatCompletionsFixtures(
  family: PiFamily,
  root: string,
): Promise<FixtureReport> {
  const records = familyRecords(family)
  const contributions = composeFamilies([family])
  const problems: string[] = []
  for (const { adoption, record } of records) {
    const label = `${record.name}/${record.revision}`
    const directory = join(root, fixtureDirectory(record))
    const files = await readFixtureFiles(directory)
    if ('missing' in files) {
      problems.push(...files.missing.map(file => `${label}: missing ${file}`))
      continue
    }
    const supplier: Supplier = {
      adoption,
      recipient: record.route.recipient,
      model: record.route.model,
      credential: { kind: 'factory' },
    }
    const acquired = await contributions.acquire(supplier, new AbortController().signal)
    if (!('ok' in acquired)) {
      problems.push(`${label}: acquire failed: ${JSON.stringify(acquired.failure)}`)
      continue
    }
    try {
      problems.push(...checkEncode(label, acquired.ok, files.request))
      problems.push(...(await checkDecode(label, acquired.ok, files.stream, files.facts)))
    } finally {
      await acquired.ok.release()
    }
  }
  problems.push(...(await extraDirectories(root, records)))
  return Object.freeze({ problems: Object.freeze(problems) })
}

type FixtureFiles =
  | Readonly<{ request: string; stream: Uint8Array; facts: string }>
  | Readonly<{ missing: readonly string[] }>

async function readFixtureFiles(directory: string): Promise<FixtureFiles> {
  const request = await readOrNull(join(directory, 'request.json'))
  const stream = await readOrNull(join(directory, 'stream.sse'))
  const facts = await readOrNull(join(directory, 'facts.json'))
  if (request === null || stream === null || facts === null) {
    const found = { 'request.json': request, 'stream.sse': stream, 'facts.json': facts }
    return { missing: FIXTURE_FILES.filter(file => found[file] === null) }
  }
  const decoder = new TextDecoder()
  return { request: decoder.decode(request), stream, facts: decoder.decode(facts) }
}

async function readOrNull(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

/** JSON budgets that only the size of the text bounds: fixtures are trusted repository files. */
function budgetsOf(size: number): JsonLimits {
  const bound = Math.max(1, size)
  return {
    maxBytes: bound,
    maxDepth: bound,
    maxItems: bound,
    maxMembers: bound,
    maxStringLength: bound,
    maxNumberLength: bound,
  }
}

function checkEncode(label: string, binding: PiFamilyBinding, text: string): readonly string[] {
  const where = `${label}: request.json`
  const tree = readJsonText(text, budgetsOf(new TextEncoder().encode(text).length))
  if (tree.kind !== 'ok' || tree.value.kind !== 'object') return [`${where} is not a JSON object`]
  const keys = tree.value.entries.map(entry => entry.key).toSorted()
  if (!isDeepStrictEqual(keys, ['body', 'request']))
    return [`${where} must have exactly the members request and body`]
  const expected = tree.value.entries.find(entry => entry.key === 'body')?.value
  const plain: unknown = JSON.parse(text)
  const request = judgeFixedModelRequest(
    typeof plain === 'object' && plain !== null ? Reflect.get(plain, 'request') : undefined,
  )
  if (!('ok' in request) || expected === undefined)
    return [`${where}: the contract refuses the request: ${JSON.stringify(failureOf(request))}`]
  const encoded = binding.encode({ request: request.ok, media: [] })
  if (!('ok' in encoded)) return [`${label}: encode failed: ${JSON.stringify(encoded.failure)}`]
  const actualText = writeJsonText(encoded.ok.body)
  const expectedText = writeJsonText(sorted(expected))
  if (actualText === expectedText) return []
  return [
    `${label}: the encoded body differs from request.json body\n  expected ${expectedText}\n  actual   ${actualText}`,
  ]
}

function failureOf(outcome: object): unknown {
  return 'failure' in outcome ? outcome.failure : null
}

async function checkDecode(
  label: string,
  binding: PiFamilyBinding,
  stream: Uint8Array,
  factsText: string,
): Promise<readonly string[]> {
  let expected: unknown
  try {
    expected = JSON.parse(factsText)
  } catch {
    return [`${label}: facts.json is not JSON`]
  }
  if (!Array.isArray(expected)) return [`${label}: facts.json is not an array of facts`]
  const actual = await replayStream(binding, stream)
  const plainActual: unknown = JSON.parse(JSON.stringify(actual))
  if (isDeepStrictEqual(plainActual, expected)) return []
  return [
    `${label}: the facts of stream.sse differ from facts.json\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(plainActual)}`,
  ]
}

/**
 * The facts of one SSE body through a new decoder of the binding, ending with the one `ended`:
 * the body decoding of a send and its termination, without an exchange.
 */
export async function replayStream(
  binding: PiFamilyBinding,
  stream: Uint8Array,
): Promise<readonly TransportFact[]> {
  const facts: TransportFact[] = []
  const progress: Progress = { bodyComplete: false }
  const decoding = decodeBody({
    body: oneChunk(stream),
    decoder: binding.createDecoder(),
    endMarker: GATEWAY_END_MARKER,
    limits: { maxEventBytes: Math.max(1, stream.length), json: budgetsOf(stream.length) },
    received: () => true,
    progress,
  })
  let step = await decoding.next()
  while (step.done !== true) {
    facts.push(step.value)
    step = await decoding.next()
  }
  facts.push({ kind: 'ended', termination: terminationOf(step.value) })
  return facts
}

async function* oneChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array, void, undefined> {
  yield bytes
}

async function directoriesOf(path: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

async function extraDirectories(
  root: string,
  records: readonly Readonly<{ adoption: Adoption; record: { name: string; revision: string } }>[],
): Promise<readonly string[]> {
  const expected = new Set(records.map(({ record }) => fixtureDirectory(record)))
  const names = new Set(records.map(({ record }) => encodeURIComponent(record.name)))
  const problems: string[] = []
  for (const name of (await directoriesOf(root)).toSorted()) {
    if (!names.has(name)) {
      problems.push(`extra directory ${name}: no record has this name`)
      continue
    }
    for (const revision of (await directoriesOf(join(root, name))).toSorted())
      if (!expected.has(join(name, revision)))
        problems.push(`extra directory ${join(name, revision)}: no record has this revision`)
  }
  return problems
}
