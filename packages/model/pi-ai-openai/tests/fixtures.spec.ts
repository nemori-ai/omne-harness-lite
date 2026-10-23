// The replay fixtures of the OpenAI family (#463 C1): every record has its fixture, the request
// fixture encodes to its body and the stream fixture decodes to the facts that the sealed tests
// expect, translated to contract facts. The extra cases each check one record. A captured stream
// of the real gateway checks the decoding of the real shape: many summary pieces and an encrypted
// item with a real id (#466).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TransportFact } from '@omne-harness/model-contract'
import { composeFamilies, defineFamily } from '@omne-harness/pi-ai-transport'
import {
  checkChatCompletionsFixtures,
  fixtureDirectory,
} from '@omne-harness/pi-ai-transport/testing'
import { OPENAI_OWNER } from '@omne-harness/pi-ai-openai'
import {
  CAPTURED_DIRECTORY,
  CASES_DIRECTORY,
  FIXTURES_ROOT,
  RECORDS_DIRECTORY,
  renderedCases,
} from './support/fixture-files.ts'
import { FAMILY, recordNamed } from './support/openai.ts'

const root = fileURLToPath(FIXTURES_ROOT)
const SHOWN = { toHuman: true, toModel: true }
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

/** The data frames of an SSE body as JSON, without comments and without the end marker. */
function dataFrames(stream: string): readonly unknown[] {
  return stream
    .split('\n\n')
    .flatMap(event => event.split('\n'))
    .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map(line => JSON.parse(line.slice('data: '.length)))
}

/** The `reasoning_details` items of the frames, in arrival order. */
function detailsOf(frames: readonly unknown[]): readonly Readonly<Record<string, unknown>>[] {
  return frames.flatMap(frame => {
    const [choice] = Reflect.get(Object(frame), 'choices') ?? []
    const details: unknown = Reflect.get(
      Object(Reflect.get(Object(choice), 'delta')),
      'reasoning_details',
    )
    return Array.isArray(details) ? details : []
  })
}

describe('a stream captured from the real gateway: openai/gpt-5.6-sol at medium effort', () => {
  const captured = join(root, CAPTURED_DIRECTORY)
  const record = recordNamed('openai/gpt-5.6-sol')
  const directory = join(captured, fixtureDirectory(record))
  const frames = dataFrames(readFileSync(join(directory, 'stream.sse'), 'utf8'))
  const facts: readonly TransportFact[] = JSON.parse(
    readFileSync(join(directory, 'facts.json'), 'utf8'),
  )
  const sealed = facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block] : []))

  it('the request encodes to the body that was sent, and the stream decodes to facts.json', async () => {
    const report = await checkChatCompletionsFixtures(oneRecordFamily(record.name), captured)
    expect(report.problems).toEqual([])
  })

  it('the summaries become one thinking block, each piece once, and the reply text is sealed', () => {
    const summaries = detailsOf(frames).filter(item => item.type === 'reasoning.summary')
    expect(summaries.length).toBeGreaterThan(1)
    const text = summaries.map(item => item.summary).join('')
    expect(sealed.filter(block => block.kind === 'thinking')).toEqual([
      { kind: 'thinking', id: 'b0', visibility: SHOWN, text },
    ])
    expect(sealed.filter(block => block.kind === 'text')).toEqual([
      { kind: 'text', id: 'b1', visibility: SHOWN, text: '76' },
    ])
  })

  it('the one encrypted item becomes one reasoning state paired with the thinking block', () => {
    const encrypted = detailsOf(frames).filter(item => item.type === 'reasoning.encrypted')
    expect(encrypted).toHaveLength(1)
    const states = sealed.filter(block => block.kind === 'reasoning_state')
    expect(states).toHaveLength(1)
    const [state] = states
    if (state?.kind !== 'reasoning_state') throw new Error('no reasoning state')
    expect(JSON.parse(state.payload)).toEqual(encrypted[0])
    expect(state.pairs).toEqual(['b0'])
  })

  it('the call ends completed with the usage of the last frame, reasoning included', () => {
    const accounts = facts.filter(fact => fact.kind === 'account')
    expect(accounts).toHaveLength(1)
    const usage = accounts[0]?.kind === 'account' ? accounts[0].value.usage : []
    expect(usage).toEqual(
      expect.arrayContaining([
        { name: 'input', state: 'known', lexeme: '33', unit: 'token' },
        { name: 'output', state: 'known', lexeme: '98', unit: 'token' },
        { name: 'reasoning', state: 'known', lexeme: '91', unit: 'token' },
      ]),
    )
    expect(facts.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'completed', reason: 'stop' },
    })
  })
})
