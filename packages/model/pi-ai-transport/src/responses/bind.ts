import { wireLimits } from '../media.ts'
import type { Adoption, FixedModelRequest, Supplier } from '@omne-harness/model-contract'
import type { RouteAccounting } from '../config.ts'
import type { PiFamilyBinding } from '../family.ts'
import { recordAdoption } from '../family-table.ts'
import { sameAdoption } from '../engine-request.ts'
import { isPositiveInteger } from '../limits.ts'
import { declarationName, TOOL_NAME_RULES, toolNamesOf } from '../chat-completions/tool-names.ts'
import {
  defaultParameter,
  judgeParameter,
  PARAMETER_KINDS,
} from '../chat-completions/parameters.ts'
import { recordDeclaration } from '../chat-completions/projection.ts'
import type { FamilyMeter, GatewayField, ParameterTable } from '../chat-completions/vocabulary.ts'
import { createResponsesDecoder } from './decoder.ts'
import { toolJson } from './projection.ts'
import { encodeResponses, planResponses, type ResponsesContext } from './request.ts'
import type { ResponsesLimits, ResponsesRecord } from './vocabulary.ts'

export type ResponsesBindingInput = Readonly<{
  record: ResponsesRecord
  supplier: Supplier
  meter: FamilyMeter
  limits: ResponsesLimits
  /** The byte limit of one image of this profile; absent, images have none. */
  imageBytes?: number
  release(): Promise<void>
}>

/** The parameter fields the Responses interface has a member for. */
const RESPONSES_FIELDS: ReadonlySet<GatewayField> = new Set([
  'max_tokens',
  'temperature',
  'top_p',
  'stop',
  'frequency_penalty',
  'presence_penalty',
  'reasoning.effort',
])

function wiredFields(table: ParameterTable): readonly GatewayField[] {
  const fields: GatewayField[] = []
  for (const kind of PARAMETER_KINDS) {
    const rule = table[kind]
    if (rule.support === 'unsupported') continue
    if ('field' in rule.wire) fields.push(rule.wire.field)
    else
      for (const mapped of Object.values(rule.wire))
        if (mapped !== 'unsupported') fields.push(mapped.field)
  }
  return fields
}

function checkRecord(record: ResponsesRecord, adoption: Adoption): void {
  recordDeclaration(record)
  const { produces, accepts } = record.replay.formats
  if (!accepts.includes(produces))
    throw new RangeError(`record ${record.name}: replay formats must accept what they produce`)
  const { toolNames } = record.wire
  if (!TOOL_NAME_RULES.includes(toolNames.rule) || !isPositiveInteger(toolNames.maxLength))
    throw new RangeError(`record ${record.name}: wire.toolNames is not an engine rule`)
  // The interface does not report which upstream served, so the pin must leave only one.
  if (record.serving.order.length !== 1 || record.serving.reports.length !== 1)
    throw new RangeError(`record ${record.name}: the serving pin must name one upstream`)
  const fields = [...wiredFields(record.parameters), ...record.extensions.map(rule => rule.field)]
  for (const field of fields)
    if (!RESPONSES_FIELDS.has(field))
      throw new RangeError(`record ${record.name}: the interface has no member for ${field}`)
  for (const kind of PARAMETER_KINDS) {
    const fallback = defaultParameter(record.parameters, kind)
    if (fallback === null) continue
    const failure = judgeParameter(fallback, { record, adapter: adoption, outputLimit: null })
    if (failure !== null)
      throw new RangeError(`record ${record.name}: the default of ${kind} is ${failure.kind}`)
  }
}

function checkInput(input: ResponsesBindingInput, adoption: Adoption): void {
  const { record, supplier, meter, limits } = input
  if (!sameAdoption(adoption, supplier.adoption))
    throw new RangeError(`record ${record.name} does not have the adoption of the supplier`)
  if (record.route.provider !== supplier.provider || record.route.model !== supplier.model)
    throw new RangeError(`record ${record.name} does not have the route of the supplier`)
  if (!sameAdoption(meter.instance.basis.supplier.adoption, adoption))
    throw new RangeError(`the meter of record ${record.name} counts for another supplier`)
  checkRecord(record, adoption)
  if (
    !isPositiveInteger(limits.maxReasoningText) ||
    !isPositiveInteger(limits.toolArguments.maxBytes)
  )
    throw new RangeError('limits must bound reasoning text and tool arguments')
}

export function bindResponses(input: ResponsesBindingInput): PiFamilyBinding {
  const { record, supplier, meter } = input
  const adoption = recordAdoption(supplier.adoption.owner, record)
  checkInput(input, adoption)
  const limits = Object.freeze({
    toolArguments: Object.freeze({ ...input.limits.toolArguments }),
    maxReasoningText: input.limits.maxReasoningText,
  })
  const context: ResponsesContext = { record, meter, supplier, adapter: adoption }
  let released: Promise<void> | undefined
  return Object.freeze({
    supplier,
    adoption,
    mediaLimits: wireLimits(record.wire, { image: input.imageBytes }),
    counting: meter.instance.basis,
    rules: Object.freeze({
      plan: (planInput: Parameters<typeof planResponses>[1]) => planResponses(context, planInput),
    }),
    meter: meter.instance,
    endpoint: 'responses',
    replayFormat: record.replay.formats.produces,
    tools: Object.freeze({
      convertToModelPayload: (declaration: Parameters<typeof toolPayloadOf>[1]) =>
        toolPayloadOf(record, declaration, adoption),
    }),
    encode: (encodeInput: Parameters<typeof encodeResponses>[1]) =>
      encodeResponses(context, encodeInput),
    createDecoder: ({
      request,
      accounting,
    }: Readonly<{ request: FixedModelRequest; accounting: RouteAccounting }>) => {
      const names = toolNamesOf({
        profile: record.wire.toolNames,
        tools: request.tools,
        messages: request.messages,
        adapter: adoption,
      })
      if (!('ok' in names))
        throw new RangeError(
          `the request of a decoder has tool names that encode refuses: ${names.failure.kind}`,
        )
      return createResponsesDecoder({ record, accounting, limits, names: names.ok })
    },
    release(): Promise<void> {
      released ??= input.release()
      return released
    },
  } satisfies PiFamilyBinding)
}

function toolPayloadOf(
  record: ResponsesRecord,
  tool: Parameters<PiFamilyBinding['tools']['convertToModelPayload']>[0],
  adapter: Adoption,
): ReturnType<PiFamilyBinding['tools']['convertToModelPayload']> {
  const name = declarationName(record.wire.toolNames, tool.name, adapter)
  if (!('ok' in name)) return name
  if (tool.argumentsSchema.kind !== 'object')
    return { failure: { kind: 'unsupported', field: 'argumentsSchema', adapter } }
  return { ok: toolJson(name.ok, tool) }
}
