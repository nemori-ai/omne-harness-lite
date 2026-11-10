// Tool names on the gateway (R2-D234), through the real OpenAI binding and the official profile:
// a tool name is the Tool identity and stays as it is in the log; the record rule `underscore/1`
// writes a gateway name of `[A-Za-z0-9_-]` up to 64, and the decoder of the same request maps a
// returned name back. A collision or a name that is too long is `unsupported`, never cut.
import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import type { FixedModelRequest, ModelBlock } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import type { PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import { OPENROUTER_ACCOUNTING } from '@omne-harness/pi-ai-transport/chat-completions'
import {
  assembledOf,
  bindingOf,
  callBlock,
  encodeInput,
  fixedRequest,
  message,
  officialProfile,
  recordNamed,
  resultBlock,
  supplierOf,
  textBlock,
  tool,
} from './support/openai.ts'

const SOL = recordNamed('openai/gpt-5.6-sol')
const GATEWAY_NAME = /^[a-zA-Z0-9_-]+$/

/** The dotted names of the release tree, as Tool gives them. */
const DOTTED = ['Files.read', 'Shell.close_session', 'Tools.status'] as const

const HISTORY = [
  message('u1', 'user', [textBlock('b1', 'read the file')]),
  message('a1', 'assistant', [callBlock('c1', 'call_1', 'Files.read')]),
  message('r1', 'tool', [resultBlock('x1', 'call_1'), textBlock('x2', 'contents')]),
  message('u2', 'user', [textBlock('b2', 'and close the shell')]),
]

function dottedRequest(): FixedModelRequest {
  return fixedRequest(SOL, {
    messages: HISTORY,
    tools: DOTTED.map(name => tool(name)),
    toolChoice: { name: 'Shell.close_session' },
  })
}

type WireBody = Readonly<{
  tools: readonly Readonly<{ function: Readonly<{ name: string }> }>[]
  tool_choice: Readonly<{ function: Readonly<{ name: string }> }>
  messages: readonly Readonly<{
    tool_calls?: readonly Readonly<{ function: Readonly<{ name: string }> }>[]
  }>[]
}>

async function encoded(request: FixedModelRequest) {
  const binding = await bindingOf(SOL)
  try {
    return binding.encode(encodeInput(request))
  } finally {
    await binding.release()
  }
}

async function bodyOf(request: FixedModelRequest): Promise<WireBody> {
  const outcome = await encoded(request)
  if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
  return JSON.parse(writeJsonText(outcome.ok.body))
}

/** Every function name that the body sends: the tools, the tool choice and the history calls. */
function namesOf(body: WireBody): readonly string[] {
  return [
    ...body.tools.map(item => item.function.name),
    body.tool_choice.function.name,
    ...body.messages.flatMap(item => (item.tool_calls ?? []).map(call => call.function.name)),
  ]
}

function data(
  value: object,
): Parameters<ReturnType<PiFamilyBinding['createDecoder']>['accept']>[0] {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65_536,
    maxDepth: 32,
    maxItems: 1_024,
    maxMembers: 256,
    maxStringLength: 65_536,
    maxNumberLength: 64,
  })
  if (read.kind !== 'ok') throw new Error('not JSON')
  return { kind: 'data', value: read.value }
}

function chunk(delta: object, finish: string | null = null): object {
  return {
    id: 'gen-1',
    object: 'chat.completion.chunk',
    model: SOL.route.model,
    provider: 'OpenAI',
    choices: [{ index: 0, delta, finish_reason: finish }],
  }
}

/** The tool calls that one reply with these gateway names seals, through a decoder of `request`. */
async function decodedCalls(
  request: FixedModelRequest,
  names: readonly string[],
): Promise<readonly ModelBlock[]> {
  const binding = await bindingOf(SOL)
  try {
    const decoder = binding.createDecoder({ request, accounting: OPENROUTER_ACCOUNTING })
    const facts: TransportFact[] = []
    const take = (outcome: ReturnType<typeof decoder.accept>): void => {
      if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
      facts.push(...outcome.ok)
    }
    const calls = names.map((name, index) => ({
      index,
      id: `call_${index}`,
      type: 'function',
      function: { name, arguments: '{"q":"x"}' },
    }))
    take(decoder.accept(data(chunk({ role: 'assistant', tool_calls: calls }))))
    take(decoder.accept(data(chunk({}, 'tool_calls'))))
    take(decoder.accept({ kind: 'end-marker' }))
    take(decoder.end())
    return facts.flatMap(fact =>
      fact.kind === 'block-seal' && fact.block.kind === 'tool_call' ? [fact.block] : [],
    )
  } finally {
    await binding.release()
  }
}

function nameOf(block: ModelBlock): string {
  if (block.kind !== 'tool_call') throw new Error(block.kind)
  return block.name
}

describe('dotted tool names on the gateway', () => {
  it('encode writes only gateway names: tools, tool choice and the history call', async () => {
    const body = await bodyOf(dottedRequest())
    const names = namesOf(body)
    expect(names).toHaveLength(DOTTED.length + 2)
    for (const name of names) expect(name).toMatch(GATEWAY_NAME)
    expect(names).toEqual([
      'Files_read',
      'Shell_close_session',
      'Tools_status',
      'Shell_close_session',
      'Files_read',
    ])
  })

  it('a name that already fits goes out as it is', async () => {
    const body = await bodyOf(fixedRequest(SOL, { tools: [tool('lookup__exact')] }))
    expect(body.tools.map(item => item.function.name)).toEqual(['lookup__exact'])
  })

  it('plan through the official profile takes the request; the meter sees the gateway names', async () => {
    const binding = await bindingOf(SOL)
    const planned = binding.rules.plan({
      profile: officialProfile(SOL),
      supplier: supplierOf(SOL),
      assembled: assembledOf(dottedRequest()),
    })
    await binding.release()
    if (!('ok' in planned)) throw new Error(JSON.stringify(planned.failure))
    if (planned.ok.representation.kind !== 'materialized') throw new Error('representation')
    const tokens = writeJsonText(planned.ok.representation.tokenInput)
    expect(tokens).toContain('"name":"Files_read"')
    expect(tokens).not.toContain('"name":"Files.read"')
    const sent = await encoded(dottedRequest())
    if (!('ok' in sent)) throw new Error(JSON.stringify(sent.failure))
    expect(sent.ok.representation).toEqual(planned.ok.representation)
  })

  it('the decoder of the same request gives the Tool names back', async () => {
    const calls = await decodedCalls(dottedRequest(), ['Files_read', 'Shell_close_session'])
    expect(calls.map(nameOf)).toEqual(['Files.read', 'Shell.close_session'])
  })

  it('a returned name that no request name maps to stays as it is', async () => {
    const calls = await decodedCalls(dottedRequest(), ['Files_write'])
    expect(calls.map(nameOf)).toEqual(['Files_write'])
  })

  it('convertToModelPayload writes the gateway name of one declaration', async () => {
    const binding = await bindingOf(SOL)
    const request = fixedRequest(SOL, { tools: [tool('Files.read'), tool(`F.${'x'.repeat(63)}`)] })
    const [fits, long] = request.tools
    if (fits === undefined || long === undefined) throw new Error('tools')
    const payload = binding.tools.convertToModelPayload(fits)
    const refused = binding.tools.convertToModelPayload(long)
    await binding.release()
    if (!('ok' in payload)) throw new Error(JSON.stringify(payload.failure))
    expect(JSON.parse(writeJsonText(payload.ok))).toMatchObject({
      function: { name: 'Files_read' },
    })
    expect(refused).toEqual({
      failure: { kind: 'unsupported', field: 'name', adapter: supplierOf(SOL).adoption },
    })
  })
})

describe('names that cannot go out', () => {
  const adapter = supplierOf(SOL).adoption

  it('two names with one gateway name are unsupported at the later tool', async () => {
    const request = fixedRequest(SOL, { tools: [tool('a.b'), tool('a_b')] })
    expect(await encoded(request)).toEqual({
      failure: { kind: 'unsupported', field: '/tools/1/name', adapter },
    })
  })

  it('a history call whose gateway name a declared tool has is unsupported at that call', async () => {
    const request = fixedRequest(SOL, { messages: HISTORY, tools: [tool('Files_read')] })
    expect(await encoded(request)).toEqual({
      failure: { kind: 'unsupported', field: '/messages/1/blocks/0', adapter },
    })
  })

  it('plan refuses the same collision before sending', async () => {
    const binding = await bindingOf(SOL)
    const request = fixedRequest(SOL, { tools: [tool('a.b'), tool('a_b')] })
    const planned = binding.rules.plan({
      profile: officialProfile(SOL),
      supplier: supplierOf(SOL),
      assembled: assembledOf(request),
    })
    await binding.release()
    expect(planned).toEqual({ failure: { kind: 'unsupported', field: '/tools/1/name', adapter } })
  })

  it('a name longer than 64 is unsupported and not cut; 64 goes out whole', async () => {
    const edge = `F.${'x'.repeat(62)}`
    const body = await bodyOf(fixedRequest(SOL, { tools: [tool(edge)] }))
    expect(body.tools.map(item => item.function.name)).toEqual([`F_${'x'.repeat(62)}`])
    const request = fixedRequest(SOL, { tools: [tool('ok'), tool(`${edge}x`)] })
    expect(await encoded(request)).toEqual({
      failure: { kind: 'unsupported', field: '/tools/1/name', adapter },
    })
  })

  it('a decoder is not made for a request whose names encode refuses', async () => {
    const binding = await bindingOf(SOL)
    const request = fixedRequest(SOL, { tools: [tool('a.b'), tool('a_b')] })
    expect(() => binding.createDecoder({ request, accounting: OPENROUTER_ACCOUNTING })).toThrow(
      RangeError,
    )
    await binding.release()
  })
})
