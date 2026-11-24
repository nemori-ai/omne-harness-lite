import {
  toContentBlocks,
  type CallOutcome,
  type InvokeResult,
  type NotSentReason,
} from '@omne-harness/mcp-contract'
import { generationOf, jsonOf, taskIdOf } from '@omne-harness/mcp-contract/testing'
import { describe, expect, it } from 'vitest'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import { PEER_TEXT_BEGIN, PEER_TEXT_END, settle, type Settlement } from '../src/index.ts'

const sent = (outcome: CallOutcome): InvokeResult => ({ kind: 'sent', outcome })
const came = (result: InvokeResult, maxBytes = 65_536) =>
  settle('mcp__docs', 'search', result, maxBytes)

function textOf(settlement: Settlement): string {
  if (settlement.effect !== 'happened') throw new Error(`no result: ${settlement.message}`)
  expect(settlement.result).toMatchObject({
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments: [],
  })
  expect(settlement.result.content).toHaveLength(1)
  const [block] = settlement.result.content
  if (block?.kind !== 'text') throw new Error('the result is not one text block')
  return block.text
}

const NOT_SENT: readonly (readonly [NotSentReason, string])[] = [
  [{ kind: 'not-available-to-you' }, 'the endpoint is not available to this caller'],
  [{ kind: 'blocked', reason: 'disabled' }, 'the endpoint is disabled'],
  [{ kind: 'unknown' }, 'whether the endpoint may be used could not be read'],
  [{ kind: 'config-missing', item: 'target' }, 'the address of the endpoint is not set'],
  [{ kind: 'config-missing', item: 'credential' }, 'the credential of the endpoint is not set'],
  [
    { kind: 'config-invalid', item: 'connect-timeout' },
    'the connection timeout of the endpoint is not valid',
  ],
  [{ kind: 'correlation-key-in-use' }, 'this call is already in flight'],
  [{ kind: 'cancelled' }, 'the call was cancelled before it was sent'],
  [{ kind: 'definition-changed' }, 'the definition of the action changed'],
  [{ kind: 'action-unavailable' }, 'the endpoint does not offer this action now'],
  [
    { kind: 'credential-unavailable', cause: 'missing' },
    'the credential of the endpoint is not set',
  ],
  [
    { kind: 'credential-unavailable', cause: 'rejected' },
    'the credential of the endpoint was rejected',
  ],
  [
    { kind: 'credential-unavailable', cause: 'unknown' },
    'the credential of the endpoint could not be read',
  ],
  [
    {
      kind: 'authorization-required',
      discovery: {
        resourceMetadataUrl: 'https://x',
        metadata: 'unavailable',
        issuers: [],
        scopes: [],
      },
    },
    'the endpoint requires an authorization this version cannot give',
  ],
  [{ kind: 'connection-unavailable' }, 'the endpoint could not be reached'],
]

describe('what a call came to', () => {
  it.each(NOT_SENT)('not sent, %j: did not start, with the reason', (reason, text) => {
    const settlement = came({ kind: 'not-sent', reason })
    expect(settlement.effect).toBe('not-started')
    expect(settlement).toMatchObject({
      message: expect.stringContaining(`mcp__docs search did not start: ${text}`),
    })
    expect(settlement).toMatchObject({
      message: expect.stringContaining('Nothing was sent to the endpoint.'),
    })
  })

  it('complete: the content of the endpoint, as one text between the marks', () => {
    const text = textOf(
      came(
        sent({
          kind: 'complete',
          content: toContentBlocks([
            jsonOf({ type: 'text', text: 'first' }),
            jsonOf({ type: 'text', text: 'second' }),
          ]),
          output: { kind: 'no-schema' },
        }),
      ),
    )
    expect(text).toBe(`done mcp__docs search\n${PEER_TEXT_BEGIN}\nfirst\nsecond\n${PEER_TEXT_END}`)
  })

  it('structured content a text item already carries is not written twice', () => {
    const text = textOf(
      came(
        sent({
          kind: 'complete',
          content: toContentBlocks([jsonOf({ type: 'text', text: '{ "b": 1, "answer": 42 }' })]),
          structured: jsonOf({ answer: 42, b: 1 }),
          output: { kind: 'conforms' },
        }),
      ),
    )
    expect(text).toBe(
      `done mcp__docs search\n${PEER_TEXT_BEGIN}\n{ "b": 1, "answer": 42 }\n${PEER_TEXT_END}`,
    )
  })

  it('structured content no text item carries is written after the text, not dropped', () => {
    const text = textOf(
      came(
        sent({
          kind: 'complete',
          content: toContentBlocks([jsonOf({ type: 'text', text: 'Found one.' })]),
          structured: jsonOf({ answer: 42 }),
          output: { kind: 'conforms' },
        }),
      ),
    )
    expect(text).toBe(
      `done mcp__docs search\n${PEER_TEXT_BEGIN}\nFound one.\nstructured content: {"answer":42}\n${PEER_TEXT_END}`,
    )
  })

  it('complete with structured content and no text: the structured content is the text', () => {
    const text = textOf(
      came(
        sent({
          kind: 'complete',
          content: [],
          structured: jsonOf({ answer: 42 }),
          output: { kind: 'no-schema' },
        }),
      ),
    )
    expect(text).toContain(
      `${PEER_TEXT_BEGIN}\nstructured content: {"answer":42}\n${PEER_TEXT_END}`,
    )
  })

  it('complete with nothing: says so, outside the marks', () => {
    const text = textOf(
      came(sent({ kind: 'complete', content: [], output: { kind: 'no-schema' } })),
    )
    expect(text).toBe('done mcp__docs search\nThe endpoint returned no content.')
  })

  it('complete, the structured content breaks the declared output schema: the result says so', () => {
    const text = textOf(
      came(
        sent({
          kind: 'complete',
          content: toContentBlocks([jsonOf({ type: 'text', text: 'x' })]),
          structured: jsonOf({ answer: 'no' }),
          output: { kind: 'violates', reason: 'answer must be a number' },
        }),
      ),
    )
    expect(text).toContain(
      `${PEER_TEXT_END}\nThe structured content does not match the output schema the endpoint declared: answer must be a number`,
    )
  })

  it('an answer larger than one result carries is cut, says so, and still fits as JSON', () => {
    const long = `${'字"\n'.repeat(4000)}tail`
    const settlement = came(
      sent({
        kind: 'complete',
        content: toContentBlocks([jsonOf({ type: 'text', text: long })]),
        output: { kind: 'no-schema' },
      }),
      8192,
    )
    const text = textOf(settlement)
    expect(Buffer.byteLength(JSON.stringify(text))).toBeLessThanOrEqual(8192)
    expect(Buffer.byteLength(JSON.stringify(text))).toBeGreaterThan(8192 - 2048 - 16)
    expect(text).not.toContain('tail')
    expect(text).toMatch(
      /\[external data ends\]\nThe result is cut here: the endpoint returned about \d+ bytes/u,
    )
    expect(text.startsWith(`done mcp__docs search\n${PEER_TEXT_BEGIN}\n字"\n`)).toBe(true)
  })

  it('content that is not text is named, not dropped silently', () => {
    const text = textOf(
      came(
        sent({
          kind: 'complete',
          content: toContentBlocks([
            jsonOf({ type: 'image', data: 'AAAA', mimeType: 'image/png' }),
            jsonOf({ type: 'resource_link', uri: 'https://x/y', name: 'y' }),
            jsonOf({ type: 'resource', resource: { uri: 'file:///a', text: 'inside' } }),
            jsonOf({ type: 'resource', resource: { uri: 'file:///b', blob: 'AAAA' } }),
            jsonOf({ type: 'hologram' }),
          ]),
          output: { kind: 'no-schema' },
        }),
      ),
    )
    expect(text).toContain('[the endpoint returned image content of type image/png;')
    expect(text).toContain('[resource link] https://x/y y')
    expect(text).toContain('[resource file:///a]\ninside')
    expect(text).toContain('[the endpoint returned a binary resource file:///b;')
    expect(text).toContain('was not delivered: type-unknown')
  })

  it('the action reported its own error: a result that says the action failed', () => {
    const text = textOf(
      came(
        sent({
          kind: 'toolError',
          content: toContentBlocks([jsonOf({ type: 'text', text: 'no such library' })]),
        }),
      ),
    )
    expect(text).toBe(
      'mcp__docs search: the endpoint reported that the action failed. Its report follows.\n' +
        `${PEER_TEXT_BEGIN}\nno such library\n${PEER_TEXT_END}`,
    )
  })

  it.each([
    [
      'a protocol error',
      { kind: 'protocolError', fault: { kind: 'peer-error', code: -32603, message: 'boom\nline' } },
      'the endpoint answered with a protocol error (code -32603): "boom line"',
    ],
    [
      'an unknown result type',
      { kind: 'protocolError', fault: { kind: 'result-type-unknown', resultType: 'future' } },
      'the endpoint answered with a result of a type this version does not know ("future")',
    ],
    [
      'a malformed result',
      { kind: 'protocolError', fault: { kind: 'result-malformed' } },
      'the endpoint answered with a result that could not be read',
    ],
    [
      'a malformed error',
      { kind: 'protocolError', fault: { kind: 'error-malformed' } },
      'the endpoint answered with an error that could not be read',
    ],
    [
      'a broken stream',
      { kind: 'unknown', cause: 'stream-broken' },
      'the connection broke before an answer arrived',
    ],
    [
      'an abandoned wait',
      { kind: 'unknown', cause: 'abandoned' },
      'the wait for an answer was given up',
    ],
    [
      'a request for input',
      { kind: 'inputRequired', issuedAt: generationOf(1) },
      'the endpoint asked a person for more input, which this version does not support',
    ],
  ] as const)('%s: sent, effect not known, not sent again', (_, outcome, text) => {
    const settlement = came(sent(outcome))
    expect(settlement).toEqual({
      effect: 'unknown',
      message: `mcp__docs search was sent, and ${text}. Whether the action took effect is not known. It was not sent again.`,
    })
  })

  it('a task: sent, effect not known, and the task is to be cancelled', () => {
    const settlement = came(
      sent({ kind: 'task', taskId: taskIdOf('task-9'), issuedAt: generationOf(3) }),
    )
    expect(settlement).toMatchObject({
      effect: 'unknown',
      cancelTask: { taskId: 'task-9', issuedAt: 3 },
      message: expect.stringMatching(/long-running task.*not known/u),
    })
  })
})

// MC-26: a program is given content that passed the output check, or the items in order; never an unchecked structure.
describe('what a call gives a program', () => {
  const program = {
    kind: 'json',
    contract: describedAdoption({ owner: 'bridge-tests', name: 'program-data', revision: '1' }),
    schema: { id: 'bridge-tests/out', revision: '1', digest: 'sha256:out' },
    definition: {
      schema: jsonOf({ type: 'object' }),
      vocabulary: describedAdoption({ owner: 'bridge-tests', name: 'schema', revision: '1' }),
      descriptions: [],
    },
    maxBytes: 1024,
    external: true,
  } as const
  const given = (outcome: CallOutcome) => {
    const settlement = settle('mcp__docs', 'search', sent(outcome), 65_536, program)
    if (settlement.effect !== 'happened') throw new Error(`no result: ${settlement.message}`)
    return settlement.result.data
  }
  const text = toContentBlocks([jsonOf({ type: 'text', text: 'x' })])
  const valued = (value: unknown) => ({
    kind: 'json',
    contract: program.contract,
    schema: program.schema,
    value: jsonOf(value),
  })

  it('the structured content, when it conforms to the declared output schema', () => {
    const structured = jsonOf({ answer: 42 })
    expect(
      given({ kind: 'complete', content: text, structured, output: { kind: 'conforms' } }),
    ).toEqual(valued({ answer: 42 }))
  })

  it('nothing, when the structured content breaks the declared output schema or is missing', () => {
    const output = { kind: 'violates', reason: 'answer must be a number' } as const
    const structured = jsonOf({ answer: 'no' })
    expect(given({ kind: 'complete', content: text, structured, output })).toEqual({ kind: 'none' })
    expect(given({ kind: 'complete', content: text, output })).toEqual({ kind: 'none' })
    expect(given({ kind: 'complete', content: text, output: { kind: 'conforms' } })).toEqual({
      kind: 'none',
    })
  })

  it('the content items in order, when the action declares no output schema', () => {
    const content = toContentBlocks([
      jsonOf({ type: 'text', text: 'first' }),
      jsonOf({ type: 'image', data: 'aGk=', mimeType: 'image/png' }),
      jsonOf({ type: 'resource_link', uri: 'file:///a.txt', name: 'a.txt' }),
      jsonOf({ type: 'resource', resource: { uri: 'file:///b.txt', text: 'held' } }),
      jsonOf({ type: 'hologram' }),
      jsonOf({ type: 'text', text: 'last' }),
    ])
    expect(given({ kind: 'complete', content, output: { kind: 'no-schema' } })).toEqual(
      valued([
        { type: 'text', text: 'first' },
        { type: 'image', mediaType: 'image/png' },
        { type: 'resource_link', uri: 'file:///a.txt', name: 'a.txt' },
        { type: 'resource', uri: 'file:///b.txt', text: 'held' },
        { type: 'undelivered', reason: 'type-unknown' },
        { type: 'text', text: 'last' },
      ]),
    )
  })

  it('nothing, when the action reported its own error', () => {
    expect(given({ kind: 'toolError', content: text, structured: jsonOf({ answer: 1 }) })).toEqual({
      kind: 'none',
    })
  })

  it('nothing, when no program made the call', () => {
    const settlement = came(
      sent({
        kind: 'complete',
        content: text,
        structured: jsonOf({ answer: 42 }),
        output: { kind: 'conforms' },
      }),
    )
    expect(settlement).toMatchObject({ effect: 'happened', result: { data: { kind: 'none' } } })
  })
})
