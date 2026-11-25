#!/usr/bin/env node
// Runs the fact cases of one model through the OpenRouter gateway and writes a fact table.
// Usage:
//   OPENROUTER_API_KEY=<key> node probe-model.mjs <model> [--interface messages|responses|chat]
//     [--provider <OpenRouter provider>] [--out <directory>] [--only <case>]...
// The interface defaults by vendor: anthropic/ → messages, openai/ → responses, others → chat.
// The provider pinned, with no fallback, defaults to the vendor; give it when the two differ.
// The key is read from the environment and goes only into the Authorization header.
// Every request and response is written to the output directory; the table is facts.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://openrouter.ai/api/v1'

function argsOf(argv) {
  const [model, ...rest] = argv
  if (model === undefined || model.startsWith('--')) throw new Error('give a model, as vendor/name')
  const options = { model, iface: null, provider: null, out: null, only: [] }
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]
    const value = rest[(index += 1)]
    if (value === undefined) throw new Error(`${flag} needs a value`)
    if (flag === '--interface') options.iface = value
    else if (flag === '--provider') options.provider = value
    else if (flag === '--out') options.out = value
    else if (flag === '--only') options.only.push(value)
    else throw new Error(`unknown argument ${flag}`)
  }
  const vendor = model.split('/')[0]
  options.iface ??= vendor === 'anthropic' ? 'messages' : vendor === 'openai' ? 'responses' : 'chat'
  options.provider ??= vendor
  if (!['messages', 'responses', 'chat'].includes(options.iface))
    throw new Error(`no such interface: ${options.iface}`)
  options.out ??= join(process.cwd(), `probe-${model.replace(/[/.]/g, '_')}-${Date.now()}`)
  return options
}

const PATHS = { messages: 'messages', responses: 'responses', chat: 'chat/completions' }
const pin = provider => ({ provider: { order: [provider], allow_fallbacks: false } })
const TOOL_PARAMETERS = {
  type: 'object',
  properties: { city: { type: 'string' } },
  required: ['city'],
  additionalProperties: false,
}
const TOOL_DESCRIPTION = 'Read the current weather of one city.'
const ASK = 'Reply with the single word: ok'
const WEATHER = 'What is the weather in Oslo? Use the tool.'
const THINK = 'Which of Oslo and Lima is further north? Answer in one sentence.'
const REASONING = new Set(['thinking', 'redacted_thinking', 'reasoning', 'reasoning_details'])
const LONG =
  'The quick brown fox jumps over the lazy dog near the quiet river bank at dawn. '.repeat(80)

// One shape per interface: how a request says each thing, and how a response is read.
const SHAPES = {
  messages: {
    base: (model, text) => ({
      model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: text }],
    }),
    effort: effort => ({ output_config: { effort } }),
    reasoningOff: { thinking: { type: 'disabled' } },
    tools: {
      tools: [
        { name: 'get_weather', description: TOOL_DESCRIPTION, input_schema: TOOL_PARAMETERS },
      ],
    },
    choices: {
      auto: { type: 'auto' },
      none: { type: 'none' },
      forced: { type: 'any' },
      named: { type: 'tool', name: 'get_weather' },
    },
    endsWithAssistant: text => [
      { role: 'user', content: ASK },
      { role: 'assistant', content: text },
    ],
    system: (body, text) => ({
      ...body,
      system: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }],
    }),
    append: (body, reply, text) => ({
      ...body,
      messages: [
        ...body.messages,
        { role: 'assistant', content: reply.content },
        { role: 'user', content: text },
      ],
    }),
    blocks: json => (json?.content ?? []).map(block => block.type),
    usage: json => ({
      input: json?.usage?.input_tokens,
      cacheRead: json?.usage?.cache_read_input_tokens,
      cacheWrite: json?.usage?.cache_creation_input_tokens,
    }),
  },
  responses: {
    base: (model, text) => ({
      model,
      max_output_tokens: 1500,
      store: false,
      input: [{ role: 'user', content: text }],
    }),
    effort: effort => ({ reasoning: { effort } }),
    reasoningOff: { reasoning: { enabled: false } },
    tools: {
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: TOOL_DESCRIPTION,
          parameters: TOOL_PARAMETERS,
        },
      ],
    },
    choices: {
      auto: 'auto',
      none: 'none',
      forced: 'required',
      named: { type: 'function', name: 'get_weather' },
    },
    endsWithAssistant: text => [
      { role: 'user', content: ASK },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
    ],
    system: (body, text) => ({
      ...body,
      input: [{ role: 'developer', content: text }, ...body.input],
    }),
    append: (body, reply, text) => ({
      ...body,
      include: ['reasoning.encrypted_content'],
      input: [...body.input, ...(reply.output ?? []), { role: 'user', content: text }],
    }),
    blocks: json => (json?.output ?? []).map(item => item.type),
    usage: json => ({
      input: json?.usage?.input_tokens,
      cacheRead: json?.usage?.input_tokens_details?.cached_tokens,
      cacheWrite: json?.usage?.input_tokens_details?.cache_write_tokens,
    }),
  },
  chat: {
    base: (model, text) => ({
      model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: text }],
    }),
    effort: effort => ({ reasoning: { effort } }),
    reasoningOff: { reasoning: { enabled: false } },
    tools: {
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: TOOL_DESCRIPTION,
            parameters: TOOL_PARAMETERS,
          },
        },
      ],
    },
    choices: {
      auto: 'auto',
      none: 'none',
      forced: 'required',
      named: { type: 'function', function: { name: 'get_weather' } },
    },
    endsWithAssistant: text => [
      { role: 'user', content: ASK },
      { role: 'assistant', content: text },
    ],
    system: (body, text) => ({
      ...body,
      messages: [{ role: 'system', content: text }, ...body.messages],
    }),
    append: (body, reply, text) => ({
      ...body,
      messages: [
        ...body.messages,
        reply.choices?.[0]?.message ?? { role: 'assistant', content: '' },
        { role: 'user', content: text },
      ],
    }),
    blocks: json => {
      const message = json?.choices?.[0]?.message ?? {}
      return [
        ...(message.reasoning_details?.length ? ['reasoning_details'] : []),
        ...(message.content ? ['text'] : []),
        ...(message.tool_calls?.length ? ['tool_calls'] : []),
      ]
    },
    usage: json => ({
      input: json?.usage?.prompt_tokens,
      cacheRead: json?.usage?.prompt_tokens_details?.cached_tokens,
      cacheWrite: json?.usage?.prompt_tokens_details?.cache_write_tokens,
    }),
  },
}

function errorOf(status, json, text) {
  if (status === 200 && json?.error === undefined) return null
  const error = json?.error ?? {}
  return String(error.message ?? text)
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

async function main() {
  const options = argsOf(process.argv.slice(2))
  const key = process.env.OPENROUTER_API_KEY ?? ''
  if (key === '') throw new Error('OPENROUTER_API_KEY is required')
  mkdirSync(options.out, { recursive: true })
  const shape = SHAPES[options.iface]
  const pinned = pin(options.provider)
  const base = { ...shape.base(options.model, ASK), ...pinned }
  const rows = []
  let spent = 0

  async function send(name, body) {
    const response = await fetch(`${BASE}/${PATHS[options.iface]}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    writeFileSync(join(options.out, `${name}.request.json`), `${JSON.stringify(body, null, 1)}\n`)
    writeFileSync(
      join(options.out, `${name}.response.json`),
      json ? `${JSON.stringify(json, null, 1)}\n` : text,
    )
    const cost = Number(json?.usage?.cost ?? 0)
    if (Number.isFinite(cost)) spent += cost
    return { status: response.status, json, error: errorOf(response.status, json, text) }
  }

  async function fact(name, body, observe = json => ({ blocks: shape.blocks(json).join('+') })) {
    if (options.only.length > 0 && !options.only.some(prefix => name.startsWith(prefix)))
      return null
    const answer = await send(name, body)
    const seen = answer.error === null ? observe(answer.json) : { error: answer.error }
    rows.push({ name, status: answer.status, provider: answer.json?.provider ?? '', ...seen })
    return answer
  }

  await fact('default', base, json => ({
    blocks: shape.blocks(json).join('+'),
    usage: JSON.stringify(json?.usage ?? {}).slice(0, 200),
  }))
  for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    await fact(`effort-${effort}`, { ...base, ...shape.effort(effort) })
  await fact('reasoning-off', { ...base, ...shape.reasoningOff })
  for (const [name, value] of [
    ['temperature', 0.5],
    ['top_p', 0.9],
    ['top_k', 40],
    ['seed', 7],
  ])
    await fact(`sampling-${name}`, { ...base, [name]: value })
  const withTool = { ...shape.base(options.model, WEATHER), ...pinned, ...shape.tools }
  for (const [name, choice] of Object.entries(shape.choices))
    await fact(`tool-${name}`, { ...withTool, tool_choice: choice })
  const lastAssistant =
    options.iface === 'responses'
      ? { ...base, input: shape.endsWithAssistant('o') }
      : { ...base, messages: shape.endsWithAssistant('o') }
  await fact('ends-with-assistant', lastAssistant)

  // Carrying reasoning back: the second request appends the first reply as the interface returned it.
  const thinking = {
    ...shape.base(options.model, THINK),
    ...pinned,
    ...shape.effort('high'),
  }
  const first = await fact('replay-1', thinking, json => ({
    blocks: shape.blocks(json).join('+'),
    ...shape.usage(json),
  }))
  const reasoned =
    first?.error === null && shape.blocks(first.json).some(block => REASONING.has(block))
  if (first !== null && !reasoned)
    rows.push({
      name: 'replay-2',
      status: 'skipped',
      provider: '',
      why: 'replay-1 returned no reasoning block',
    })
  if (reasoned)
    await fact('replay-2', shape.append(thinking, first.json, ASK), json => ({
      blocks: shape.blocks(json).join('+'),
      ...shape.usage(json),
      transformations: JSON.stringify(json?.input_transformations ?? null),
    }))

  // The cache as a session uses it: one long prefix, three requests that only append.
  const nonce = `${Date.now()}-${Math.random()}`
  let session = shape.system(
    { ...shape.base(options.model, ASK), ...pinned },
    `Session ${nonce}. ${LONG}`,
  )
  if (options.iface === 'responses') session = { ...session, prompt_cache_key: `probe-${nonce}` }
  for (const turn of [1, 2, 3]) {
    const answer = await fact(`cache-${turn}`, session, json => shape.usage(json))
    if (answer === null || answer.error !== null) break
    session = shape.append(session, answer.json, `${ASK} (${turn})`)
  }

  const table = [
    `# Facts of ${options.model} on ${options.iface} (${new Date().toISOString()})`,
    '',
    '| case | status | provider | observed |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      ({ name, status, provider, ...seen }) =>
        `| ${name} | ${status} | ${provider} | ${JSON.stringify(seen).replaceAll('|', '\\|')} |`,
    ),
    '',
    `Cost reported by the gateway: ${spent.toFixed(6)} USD over ${rows.length} requests.`,
    '',
  ].join('\n')
  writeFileSync(join(options.out, 'facts.md'), table)
  writeFileSync(join(options.out, 'facts.json'), `${JSON.stringify(rows, null, 1)}\n`)
  console.log(
    `${rows.length} cases, ${spent.toFixed(6)} USD; table in ${join(options.out, 'facts.md')}`,
  )
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
