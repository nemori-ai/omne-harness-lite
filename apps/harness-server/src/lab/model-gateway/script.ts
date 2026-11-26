import { z } from 'zod'
import type { GatewayAnswer, GatewayScript } from './gateway.ts'

const words = z.array(z.string().min(1)).default([])
const when = z.strictObject({ has: words, lacks: words })
const call = z.strictObject({
  id: z.string().min(1),
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
})
const step = z
  .strictObject({ when, say: z.string().min(1).optional(), call: z.array(call).min(1).optional() })
  .refine(
    given => (given.say === undefined) !== (given.call === undefined),
    'a step either says a sentence (say) or calls tools (call), one of the two',
  )
const judging = z.strictObject({
  when,
  criterion: z.string().min(1),
  rule: z.string().min(1).default('kept'),
  exit: z.number().min(0).max(1).default(0.01),
})
const script = z.strictObject({ steps: z.array(step), judgings: z.array(judging).default([]) })

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

function chatAnswer(found: ModelScript['steps'][number] | undefined, model: string): GatewayAnswer {
  const serving = { model, provider: 'OpenAI' }
  if (found?.call === undefined)
    return stream([
      { ...serving, choices: [{ delta: { content: found?.say ?? NO_STEP } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
  const calls = found.call.map((made, index) => ({
    index,
    id: made.id,
    type: 'function',
    function: { name: made.tool, arguments: JSON.stringify(made.arguments) },
  }))
  return stream([
    { ...serving, choices: [{ delta: { tool_calls: calls } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ])
}

type Question = Readonly<{ type?: string; criteria?: Readonly<Record<string, unknown>> }>
type Decision = Readonly<{ model?: string; questions: Readonly<Record<string, Question>> }>

function judged(question: Question, said: Judging): object {
  if (question.type !== 'choice') return { type: 'noul', noul: said.exit }
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
            judged(question, found),
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

/** The answer a script gives one request: a judging by `judgings`, any other request by `steps`. */
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

/** The operator layer with every endpoint of the release provider pointed at the gateway. */
export function withModelRoute<L extends Layer>(layer: L, url: string): L {
  const row = layer.ops.find(op => op.id === SENDING_ROW)
  const sendStage = row?.config['sendStage'] as Readonly<Record<string, unknown>> | undefined
  if (row === undefined || sendStage === undefined)
    throw new Error(`model script: the operator layer has no send stage in ${SENDING_ROW} to route`)
  const config = { ...row.config, sendStage: { ...sendStage, endpoints: { openrouter: url } } }
  return { ...layer, ops: layer.ops.map(op => (op === row ? { ...op, config } : op)) }
}
