import { createHash } from 'node:crypto'
import type { WaitOutcome } from '@omne-harness/dispatch'
import { dispatchIdSchema, type DispatchId } from '@omne-harness/dispatch-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import {
  WAIT_RESPONSE_MAX_BYTES,
  defineToolWaitContract,
  describedAdoption,
  type ToolValueSchema,
  type ToolWaitContract,
} from '@omne-harness/tool-contract/provider'

export const DISPATCH_TOOL_OWNER = '@omne-harness/dispatch-tool'
/** The report text of an answer stays under this many bytes of JSON; the whole report is read from the dispatch. */
export const REPORT_TEXT_ANSWER_BYTES = 400_000

export type ReportWaitRequest = Readonly<{ dispatch: DispatchId }>
export type ReportWaitResponse = Readonly<{
  dispatch: string
  state: 'reported' | 'failed' | 'withdrawn' | 'handed-off'
  session: string
  report: Readonly<{ text: string; origin: 'report' | 'final-reply'; truncated: boolean }> | null
  failure: Readonly<{ cause: string; detail: string }> | null
  expectation: string | null
}>

const string = { type: 'string' } as const
const closed = (properties: Readonly<Record<string, unknown>>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const orNull = (schema: unknown) => ({ anyOf: [{ type: 'null' }, schema] })

const requestDocument = closed({ dispatch: { type: 'string', pattern: '^dsp_[0-9a-f]{64}$' } })
const responseDocument = closed({
  dispatch: string,
  state: { enum: ['reported', 'failed', 'withdrawn', 'handed-off'] },
  session: string,
  report: orNull(
    closed({
      text: string,
      origin: { enum: ['report', 'final-reply'] },
      truncated: { type: 'boolean' },
    }),
  ),
  failure: orNull(closed({ cause: string, detail: string })),
  expectation: orNull(string),
})

const sha256 = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`

export const digestOf = (parts: readonly string[]): string => sha256(JSON.stringify(parts))

function valueSchema<T>(
  name: string,
  document: Readonly<Record<string, unknown>>,
  maxBytes: number,
): ToolValueSchema<T> {
  const id = `${DISPATCH_TOOL_OWNER}/report-${name}`
  return {
    identity: { id, revision: '1', digest: sha256(JSON.stringify(document)) },
    maxBytes,
    ref: defineSchema<T>({
      id,
      load: async () => jsonSchemaDefinition<T>({ document, numbers: 'exact-or-reject' }),
    }),
  }
}

const defined = defineToolWaitContract<ReportWaitResponse, 'ask'>({
  kind: 'ask',
  adoption: describedAdoption({
    owner: DISPATCH_TOOL_OWNER,
    name: 'report-wait',
    revision: '1',
    changes:
      'A tool waits for the outcome of one dispatch: its report, its failure or its withdrawal.',
  }),
  expiry: 'forbidden',
  // A dispatching call waits for its report from the background: nobody answers it but the dispatch.
  background: 'waits',
  request: valueSchema<ReportWaitRequest>('request', requestDocument, 1024),
  response: valueSchema<ReportWaitResponse>('response', responseDocument, WAIT_RESPONSE_MAX_BYTES),
})
if ('failure' in defined) throw new TypeError(defined.failure.reason)

/** The one wait contract by which a dispatching call waits for the outcome of its dispatch. */
export const dispatchReportWait: ToolWaitContract<ReportWaitResponse, 'ask'> = defined.ok

const text = (value: string): JsonValue => ({ kind: 'string', value })
const NULL: JsonValue = { kind: 'null' }
const object = (members: Readonly<Record<string, JsonValue>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(members).map(([key, value]) => ({ key, value })),
})

export function reportWaitRequest(dispatch: DispatchId): JsonValue {
  return object({ dispatch: text(dispatch) })
}

/** Reads the dispatch out of the request text Tool keeps for the wait; null when it names none. */
export function readReportWaitRequest(kept: string): DispatchId | null {
  let value: unknown
  try {
    value = JSON.parse(kept)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const parsed = dispatchIdSchema.safeParse(Reflect.get(value, 'dispatch'))
  return parsed.success && Object.keys(value).length === 1 ? parsed.data : null
}

const jsonBytes = (value: string): number => Buffer.byteLength(JSON.stringify(value))

/** The longest start of the text whose JSON form fits the budget. A pair is never cut: half of it costs more than all of it. */
function fitted(value: string, budget: number): string {
  const whole = value.toWellFormed()
  let low = 0
  let high = whole.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (jsonBytes(whole.slice(0, middle)) <= budget) low = middle
    else high = middle - 1
  }
  return whole.slice(0, low)
}

function reportOf(report: WaitOutcome['report']): JsonValue {
  if (report === null) return NULL
  const shown = fitted(report.text, REPORT_TEXT_ANSWER_BYTES)
  return object({
    text: text(shown),
    origin: text(report.origin),
    truncated: { kind: 'boolean', value: shown !== report.text },
  })
}

/** The answer of the wait: the outcome as the dispatch keeps it, with a long report cut and marked. */
export function reportWaitAnswer(outcome: WaitOutcome): JsonValue {
  const { failure } = outcome
  return object({
    dispatch: text(outcome.id),
    state: text(outcome.state),
    session: text(outcome.session),
    report: reportOf(outcome.report),
    failure:
      failure === null
        ? NULL
        : object({ cause: text(failure.cause), detail: text(failure.detail) }),
    expectation: outcome.expectation === null ? NULL : text(outcome.expectation),
  })
}
