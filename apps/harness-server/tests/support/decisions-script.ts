import type { GatewayScript } from '../fixtures/model-gateway.ts'

type AskedQuestion = Readonly<{ type: string; criteria?: Readonly<Record<string, string>> }>

export type AskedDecision = Readonly<{
  model: string
  state: unknown
  questions: Readonly<Record<string, AskedQuestion>>
}>

/** What a scripted judge says of every criterion and every rule of one request, how sure it is that each exit came about, or the status it refuses the request with. */
export type Judged =
  | Readonly<{ criterion: string; rule?: string; exit?: number }>
  | Readonly<{ refused: number }>

/** The decision a request asks for; null when the request is a chat request. */
export function decisionOf(rawBody: string): AskedDecision | null {
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || !('questions' in body)) return null
  return body as AskedDecision
}

function answerOf(
  question: AskedQuestion,
  judged: Extract<Judged, { criterion: string }>,
): unknown {
  if (question.type !== 'choice') return { type: 'noul', noul: judged.exit ?? 0.01 }
  const options = question.criteria ?? {}
  const choice =
    'holds' in options ? judged.criterion : 'kept' in options ? (judged.rule ?? 'kept') : 'none'
  return { type: 'choice', choice, probabilities: { [choice]: 0.97 } }
}

/**
 * A gateway that also serves the decisions interface: a request with questions gets one JSON body
 * answering each of them as `judge` says for the nth such request; `judge` answering null gives a
 * body that answers nothing. Every other request goes to `script`.
 */
export function answeringDecisions(
  script: GatewayScript,
  judge: (ask: AskedDecision, nth: number) => Judged | null | Promise<Judged | null>,
  asked: AskedDecision[] = [],
): GatewayScript {
  return async request => {
    const ask = decisionOf(request.rawBody)
    if (ask === null) return script(request)
    asked.push(ask)
    const judged = await judge(ask, asked.length - 1)
    if (judged !== null && 'refused' in judged)
      return {
        status: judged.refused,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'the scripted judge refuses', code: judged.refused },
        }),
      }
    const answers =
      judged === null
        ? {}
        : Object.fromEntries(
            Object.entries(ask.questions).map(([name, q]) => [name, answerOf(q, judged)]),
          )
    return {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: ask.model,
        provider: 'OpenAI',
        answers,
        usage: { input_tokens: 120, output_tokens: 8, cost: 0.0004 },
      }),
    }
  }
}
