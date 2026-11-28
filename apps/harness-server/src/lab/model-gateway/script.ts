import { z } from 'zod'
import type { GatewayAnswer, GatewayScript } from './gateway.ts'
import { interfacePath } from './wire.ts'

const words = z.array(z.string().min(1)).default([])
const when = z.strictObject({ has: words, lacks: words })
const call = z.strictObject({
  id: z.string().min(1),
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
})
const generated = z.strictObject({
  seed: z.number().int().min(0),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(8 * 1024 * 1024),
})
const step = z
  .strictObject({
    when,
    say: z.string().min(1).optional(),
    text: generated.optional(),
    call: z.array(call).min(1).optional(),
    reasoning: generated.optional(),
  })
  .refine(
    given => [given.say, given.text, given.call].filter(one => one !== undefined).length === 1,
    'a step says a sentence (say), says generated text (text) or calls tools (call), one of the three',
  )
const judging = z.strictObject({
  when,
  criterion: z.string().min(1),
  rule: z.string().min(1).default('kept'),
  exit: z.number().min(0).max(1).default(0.01),
})
const script = z.strictObject({
  steps: z.array(step),
  judgings: z.array(judging).default([]),
  provider: z.array(when).default([]),
})

/** What the agent answers at each step, and what the judge says of a goal: the first entry that fits a request answers it. */
export type ModelScript = z.infer<typeof script>
type When = z.infer<typeof when>
type Judging = z.infer<typeof judging>

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('model script: the file is not JSON')
  }
}

export function parseModelScript(text: string): ModelScript {
  const parsed = script.safeParse(jsonOf(text))
  if (parsed.success) return parsed.data
  throw new Error(`model script: ${z.prettifyError(parsed.error)}`)
}

const fits = (rule: When, body: string): boolean =>
  rule.has.every(word => body.includes(word)) && !rule.lacks.some(word => body.includes(word))

const NO_STEP = 'model script: no step fits this request'
const SURE = 0.97

function stream(frames: readonly object[]): GatewayAnswer {
  const body = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('')
  return { status: 200, contentType: 'text/event-stream', body: `${body}data: [DONE]\n\n` }
}

const WORDS = [
  'amber',
  'basin',
  'cedar',
  'delta',
  'ember',
  'fjord',
  'grove',
  'haven',
  'inlet',
  'jetty',
  'knoll',
  'ledge',
  'marsh',
  'north',
  'oasis',
  'plain',
  'quay',
  'ridge',
  'shore',
  'tarn',
  'upland',
  'vale',
  'weir',
  'yard',
]

export function generatedText(seed: number, bytes: number): string {
  let state = (seed * 2654435761 + 1) >>> 0
  let text = ''
  while (text.length < bytes) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    text += `${WORDS[state % WORDS.length] ?? 'plain'} `
  }
  return `${text.slice(0, bytes - 1)}.`
}

type Step = ModelScript['steps'][number]

const reasoningOf = (found: Step | undefined): object[] =>
  found?.reasoning === undefined
    ? []
    : [
        {
          reasoning_details: [
            {
              type: 'reasoning.encrypted',
              id: `rs_lab_${String(found.reasoning.seed)}`,
              index: 0,
              format: 'openai-responses-v1',
              data: generatedText(found.reasoning.seed, found.reasoning.bytes),
            },
          ],
        },
      ]

function chatAnswer(found: Step | undefined, model: string): GatewayAnswer {
  const serving = { model, provider: model.startsWith('anthropic/') ? 'Anthropic' : 'OpenAI' }
  const thought = reasoningOf(found).map(delta => ({ ...serving, choices: [{ delta }] }))
  if (found?.call === undefined) {
    const content =
      found?.text === undefined
        ? (found?.say ?? NO_STEP)
        : generatedText(found.text.seed, found.text.bytes)
    return stream([
      ...thought,
      { ...serving, choices: [{ delta: { content } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
  }
  const calls = found.call.map((made, index) => ({
    index,
    id: made.id,
    type: 'function',
    function: { name: made.tool, arguments: JSON.stringify(made.arguments) },
  }))
  return stream([
    ...thought,
    { ...serving, choices: [{ delta: { tool_calls: calls } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ])
}

type Question = Readonly<{ type?: string; criteria?: Readonly<Record<string, unknown>> }>
type Decision = Readonly<{ model?: string; questions: Readonly<Record<string, Question>> }>

/** A criterion can be asked as a yes or no ("is this pass to be trusted"): the script's word for criteria answers it. */
function judged(name: string, question: Question, said: Judging): object {
  const trusted = said.criterion === 'holds' ? SURE : 1 - SURE
  if (question.type !== 'choice')
    return { type: 'noul', noul: name.startsWith('A') ? trusted : said.exit }
  const options = question.criteria ?? {}
  const choice = 'holds' in options ? said.criterion : 'kept' in options ? said.rule : 'none'
  return { type: 'choice', choice, probabilities: { [choice]: SURE } }
}

function decisionAnswer(found: Judging | undefined, asked: Decision): GatewayAnswer {
  const answers =
    found === undefined
      ? {}
      : Object.fromEntries(
          Object.entries(asked.questions).map(([name, question]) => [
            name,
            judged(name, question, found),
          ]),
        )
  const usage = { input_tokens: 120, output_tokens: 8, cost: 0 }
  const body = { model: asked.model ?? 'm', provider: 'OpenAI', answers, usage }
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

function decisionOf(rawBody: string): Decision | null {
  try {
    const body = JSON.parse(rawBody) as unknown
    const asks = typeof body === 'object' && body !== null && 'questions' in body
    return asks ? (body as Decision) : null
  } catch {
    return null
  }
}

export const PROVIDER_ORIGIN = 'https://openrouter.ai'
const DECISIONS_PATH = '/api/alpha/decisions'

/** Where the provider takes a request the script leaves to it (`provider`: the first rule that fits); null when the script answers it. */
export function providerUrlOf(
  given: ModelScript,
  request: Parameters<GatewayScript>[0],
  origin = PROVIDER_ORIGIN,
): string | null {
  if (!given.provider.some(rule => fits(rule, request.rawBody))) return null
  const path =
    decisionOf(request.rawBody) === null
      ? interfacePath(request.path, request.rawBody)
      : DECISIONS_PATH
  return `${origin}${path}`
}

/** The answer a script gives one request: a judging by `judgings`, any other request by `steps`. */
export function fittingStep(
  given: ModelScript,
  request: Parameters<GatewayScript>[0],
): number | null {
  if (decisionOf(request.rawBody) !== null) return null
  const found = given.steps.findIndex(rule => fits(rule.when, request.body))
  return found < 0 ? null : found
}

export function scriptedAnswer(
  given: ModelScript,
  request: Parameters<GatewayScript>[0],
): GatewayAnswer {
  const decision = decisionOf(request.rawBody)
  if (decision !== null)
    return decisionAnswer(
      given.judgings.find(rule => fits(rule.when, request.rawBody)),
      decision,
    )
  const model = (JSON.parse(request.body) as { model?: string }).model ?? 'm'
  return chatAnswer(
    given.steps.find(rule => fits(rule.when, request.body)),
    model,
  )
}

type Operation = Readonly<{
  kind: 'replace'
  id: string
  config: Readonly<Record<string, unknown>>
}>
type Layer = Readonly<{ ops: readonly Operation[] }>

const SENDING_ROW = 'model-records'

function sendingRow<L extends Layer>(layer: L, what: string) {
  const row = layer.ops.find(op => op.id === SENDING_ROW)
  const sendStage = row?.config['sendStage'] as Readonly<Record<string, unknown>> | undefined
  if (row === undefined || sendStage === undefined)
    throw new Error(`${what}: the operator layer has no send stage in ${SENDING_ROW}`)
  return { row, sendStage }
}

const withSendStage = <L extends Layer>(layer: L, row: Operation, sendStage: object): L => ({
  ...layer,
  ops: layer.ops.map(op => (op === row ? { ...op, config: { ...row.config, sendStage } } : op)),
})

/** The operator layer with every endpoint of the release provider pointed at the gateway. */
export function withModelRoute<L extends Layer>(layer: L, url: string): L {
  const { row, sendStage } = sendingRow(layer, 'model script')
  return withSendStage(layer, row, { ...sendStage, endpoints: { openrouter: url } })
}

const PROFILES_ROW = 'model-profiles'

export function withCompactionTrigger<L extends Layer>(layer: L, percent: string): L {
  if (!/^(100|[1-9][0-9]?)$/u.test(percent))
    throw new Error(`compaction trigger: ${percent} is not a whole percent from 1 to 100`)
  const { row, sendStage } = sendingRow(layer, 'compaction trigger')
  const profiles = sendStage['profiles'] as Readonly<Record<string, unknown>> | undefined
  const sending = withSendStage(layer, row, {
    ...sendStage,
    profiles: { ...profiles, compactionTriggerPercent: percent },
  })
  if (!sending.ops.some(op => op.id === PROFILES_ROW))
    throw new Error(`compaction trigger: the operator layer has no ${PROFILES_ROW} row`)
  return {
    ...sending,
    ops: sending.ops.map(op =>
      op.id === PROFILES_ROW
        ? { ...op, config: { ...op.config, compactionTriggerPercent: percent } }
        : op,
    ),
  }
}
