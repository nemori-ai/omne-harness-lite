import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { createSchemaProvider, validate } from '@omne-harness/schema-provider'
import {
  REPORT_TEXT_ANSWER_BYTES,
  dispatchReportWait,
  readReportWaitRequest,
  reportWaitAnswer,
  reportWaitRequest,
} from '../src/index.ts'
import { accepted, reported } from './values.ts'

const provider = createSchemaProvider({
  maxSnapshots: 4,
  maxConstructDepth: 16,
  maxConstructNodes: 512,
  failureBackoffMs: 0,
  maxAttempts: 1,
})
const judge = async (which: 'request' | 'response', value: JsonValue) =>
  (await validate(provider, dispatchReportWait[which].ref, { kind: 'ok', value })).kind

function plain(tree: JsonValue): unknown {
  if (tree.kind === 'object')
    return Object.fromEntries(tree.entries.map(entry => [entry.key, plain(entry.value)]))
  if (tree.kind === 'string' || tree.kind === 'boolean') return tree.value
  return null
}
const bytes = (tree: JsonValue): number => Buffer.byteLength(JSON.stringify(plain(tree)))
const text = (value: string): JsonValue => ({ kind: 'string', value })
const flag = (value: boolean): JsonValue => ({ kind: 'boolean', value })
const object = (members: Record<string, JsonValue>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(members).map(([key, value]) => ({ key, value })),
})

describe('the wait contract of the report of a dispatch', () => {
  it('is a decision wait of this member that never expires', () => {
    expect(dispatchReportWait.kind).toBe('ask')
    expect(dispatchReportWait.expiry).toBe('forbidden')
    expect(dispatchReportWait.adoption).toMatchObject({
      owner: '@omne-harness/dispatch-tool',
      name: 'report-wait',
    })
  })

  it('takes the request that names one dispatch, and no other request', async () => {
    const request = reportWaitRequest(accepted.id)
    expect(plain(request)).toEqual({ dispatch: accepted.id })
    expect(await judge('request', request)).toBe('valid')
    expect(await judge('request', object({ dispatch: text('dsp_1') }))).not.toBe('valid')
    expect(await judge('request', object({}))).not.toBe('valid')
    expect(
      await judge('request', object({ dispatch: text(accepted.id), more: text('x') })),
    ).not.toBe('valid')
  })

  it('reads the dispatch out of the kept request, and nothing out of another text', () => {
    expect(readReportWaitRequest(JSON.stringify({ dispatch: accepted.id }))).toBe(accepted.id)
    for (const kept of [
      'not json',
      'null',
      '"text"',
      '{}',
      '{"dispatch":"dsp_1"}',
      JSON.stringify({ dispatch: accepted.id, more: 1 }),
    ])
      expect(readReportWaitRequest(kept)).toBeNull()
  })

  it.each([
    [
      'a report',
      reported,
      {
        state: 'reported',
        report: { text: 'the work is done', origin: 'report', truncated: false },
        failure: null,
      },
    ],
    [
      'a failure',
      { ...accepted, state: 'failed', failure: { cause: 'run-failed', detail: 'it broke' } },
      { state: 'failed', report: null, failure: { cause: 'run-failed', detail: 'it broke' } },
    ],
    [
      'a withdrawal',
      { ...accepted, state: 'withdrawn' },
      { state: 'withdrawn', report: null, failure: null },
    ],
    [
      'a handed-off session',
      { ...accepted, state: 'handed-off' },
      { state: 'handed-off', report: null, failure: null },
    ],
  ] as const)(
    'answers %s as the dispatch keeps it, in the shape of the response',
    async (_name, outcome, shown) => {
      const answer = reportWaitAnswer({ ...outcome, expectation: 'three lines' })
      expect(plain(answer)).toEqual({
        dispatch: accepted.id,
        session: accepted.session,
        expectation: 'three lines',
        ...shown,
      })
      expect(await judge('response', answer)).toBe('valid')
      expect(plain(reportWaitAnswer(outcome))).toMatchObject({ expectation: null })
    },
  )

  it.each([
    ['plain text', 'a'.repeat(200_000), false],
    ['text of three bytes a character', '报'.repeat(200_000), true],
    ['text that JSON writes as six bytes a character', '\u0001'.repeat(200_000), true],
    ['text of surrogate pairs', '😀'.repeat(99_000), false],
    [
      'text of surrogate pairs past the budget',
      `a${'😀'.repeat(100_000)}${'报'.repeat(20_000)}`,
      true,
    ],
  ])(
    'keeps an answer with a report of %s under the answer limit, and marks a cut',
    async (_name, long, cut) => {
      const answer = reportWaitAnswer({
        ...reported,
        report: { text: long, origin: 'final-reply' },
      })
      const shown = plain(answer) as { report: { text: string; truncated: boolean } }
      expect(shown.report.truncated).toBe(cut)
      expect(long.startsWith(shown.report.text)).toBe(true)
      expect(shown.report.text.isWellFormed()).toBe(true)
      expect(bytes(answer)).toBeLessThanOrEqual(dispatchReportWait.response.maxBytes)
      if (cut) {
        const kept = Buffer.byteLength(JSON.stringify(shown.report.text))
        expect(kept).toBeLessThanOrEqual(REPORT_TEXT_ANSWER_BYTES)
        expect(kept).toBeGreaterThan(REPORT_TEXT_ANSWER_BYTES - 16)
      } else expect(shown.report.text).toBe(long)
      expect(await judge('response', answer)).toBe('valid')
    },
  )

  it('cuts a long report at the last character that fits, not one before it', () => {
    const long = 'a'.repeat(REPORT_TEXT_ANSWER_BYTES + 100)
    const answer = reportWaitAnswer({ ...reported, report: { text: long, origin: 'report' } })
    const shown = plain(answer) as { report: { text: string } }
    expect(shown.report.text).toHaveLength(REPORT_TEXT_ANSWER_BYTES - 2)
  })

  it('writes what the dispatch does not have as null, never as an empty text', () => {
    const entries = (tree: JsonValue) => (tree.kind === 'object' ? tree.entries : [])
    const answer = reportWaitAnswer({ ...accepted, state: 'withdrawn' })
    const absent = entries(answer).filter(entry => entry.value.kind === 'null')
    expect(absent.map(entry => entry.key)).toEqual(['report', 'failure', 'expectation'])
  })

  it.each([
    ['a state the dispatch does not have', { state: text('paused') }],
    ['a report that is a text', { report: text('done') }],
    [
      'a report from another origin',
      { report: object({ text: text('x'), origin: text('guess'), truncated: flag(false) }) },
    ],
    [
      'a report whose cut mark is not a boolean',
      { report: object({ text: text('x'), origin: text('report'), truncated: text('no') }) },
    ],
    ['a failure that is a text', { failure: text('broke') }],
    [
      'an expectation that is a number',
      { expectation: { kind: 'number', lexeme: '3' } as JsonValue },
    ],
    ['a member the response does not have', { more: text('x') }],
  ])('does not take %s as a response', async (_name, change) => {
    const members = {
      dispatch: text(accepted.id),
      state: text('reported'),
      session: text(accepted.session),
      report: { kind: 'null' } as JsonValue,
      failure: { kind: 'null' } as JsonValue,
      expectation: { kind: 'null' } as JsonValue,
    }
    expect(await judge('response', object(members))).toBe('valid')
    expect(await judge('response', object({ ...members, ...change }))).not.toBe('valid')
  })

  it('names its two schemas apart and gives each a sha256 digest', () => {
    const { request, response, adoption } = dispatchReportWait
    expect(request.identity.id).toBe('@omne-harness/dispatch-tool/report-request')
    expect(response.identity.id).toBe('@omne-harness/dispatch-tool/report-response')
    for (const digest of [request.identity.digest, response.identity.digest, adoption.digest])
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(request.identity.digest).not.toBe(response.identity.digest)
  })

  it('writes a lone surrogate of a report as a well-formed text', () => {
    const answer = reportWaitAnswer({ ...reported, report: { text: 'a\ud800b', origin: 'report' } })
    expect((plain(answer) as { report: { text: string } }).report.text).toBe('a�b')
  })
})
