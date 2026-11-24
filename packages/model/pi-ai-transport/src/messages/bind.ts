import { wireLimits } from '../media.ts'
import type {
  Adoption,
  FixedModelRequest,
  ReasoningEffortMapping,
  Supplier,
} from '@omne-harness/model-contract'
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
import { object, sorted, text } from '../chat-completions/json.ts'
import type { FamilyMeter, GatewayField, ParameterTable } from '../chat-completions/vocabulary.ts'
import { createMessagesDecoder } from './decoder.ts'
import { encodeMessages, planMessages, type MessagesContext } from './request.ts'
import type { MessagesLimits, MessagesRecord } from './vocabulary.ts'

export type MessagesBindingInput = Readonly<{
  bindingEfforts?: ReasoningEffortMapping | undefined
  record: MessagesRecord
  supplier: Supplier
  meter: FamilyMeter
  limits: MessagesLimits
  /** The byte limit of one image of this profile; absent, images have none. */
  imageBytes?: number
  release(): Promise<void>
}>

/** The parameter fields the Messages interface has a member for. */
const MESSAGES_FIELDS: ReadonlySet<GatewayField> = new Set([
  'max_tokens',
  'stop',
  'temperature',
  'top_p',
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

function checkRecord(record: MessagesRecord, adoption: Adoption): void {
  recordDeclaration(record)
  const { produces, accepts } = record.replay.formats
  if (!accepts.includes(produces))
    throw new RangeError(`record ${record.name}: replay formats must accept what they produce`)
  const { toolNames } = record.wire
  if (!TOOL_NAME_RULES.includes(toolNames.rule) || !isPositiveInteger(toolNames.maxLength))
    throw new RangeError(`record ${record.name}: wire.toolNames is not an engine rule`)
  if (record.parameters['max-output-tokens'].support === 'unsupported')
    throw new RangeError(`record ${record.name}: the interface needs an output limit`)
  const fields = [...wiredFields(record.parameters), ...record.extensions.map(rule => rule.field)]
  for (const field of fields)
    if (!MESSAGES_FIELDS.has(field))
      throw new RangeError(`record ${record.name}: the interface has no member for ${field}`)
  for (const kind of PARAMETER_KINDS) {
    const fallback = defaultParameter(record.parameters, kind)
    if (fallback === null) continue
    const failure = judgeParameter(fallback, { record, adapter: adoption, outputLimit: null })
    if (failure !== null)
      throw new RangeError(`record ${record.name}: the default of ${kind} is ${failure.kind}`)
  }
}

function checkInput(input: MessagesBindingInput, adoption: Adoption): void {
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

export function bindMessages(input: MessagesBindingInput): PiFamilyBinding {
  const { record, supplier, meter } = input
  const adoption = recordAdoption(supplier.adoption.owner, record)
  checkInput(input, adoption)
  const limits = Object.freeze({
    toolArguments: Object.freeze({ ...input.limits.toolArguments }),
    maxReasoningText: input.limits.maxReasoningText,
  })
  const context: MessagesContext = {
    record,
    meter,
    supplier,
    adapter: adoption,
    bindingEfforts: input.bindingEfforts,
  }
  let released: Promise<void> | undefined
  return Object.freeze({
    supplier,
    adoption,
    mediaLimits: wireLimits(record.wire, { image: input.imageBytes }),
    counting: meter.instance.basis,
    rules: Object.freeze({
      plan: (planInput: Parameters<typeof planMessages>[1]) => planMessages(context, planInput),
    }),
    meter: meter.instance,
    endpoint: 'messages',
    replayFormat: record.replay.formats.produces,
    tools: Object.freeze({
      convertToModelPayload: (declaration: Parameters<typeof toolPayloadOf>[1]) =>
        toolPayloadOf(record, declaration, adoption),
    }),
    encode: (encodeInput: Parameters<typeof encodeMessages>[1]) =>
      encodeMessages(context, encodeInput),
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
      return createMessagesDecoder({ record, accounting, limits, names: names.ok })
    },
    release(): Promise<void> {
      released ??= input.release()
      return released
    },
  } satisfies PiFamilyBinding)
}

function toolPayloadOf(
  record: MessagesRecord,
  tool: Parameters<PiFamilyBinding['tools']['convertToModelPayload']>[0],
  adapter: Adoption,
): ReturnType<PiFamilyBinding['tools']['convertToModelPayload']> {
  const name = declarationName(record.wire.toolNames, tool.name, adapter)
  if (!('ok' in name)) return name
  if (tool.argumentsSchema.kind !== 'object')
    return { failure: { kind: 'unsupported', field: 'argumentsSchema', adapter } }
  return {
    ok: object({
      name: text(name.ok),
      description: text(tool.description),
      input_schema: sorted(tool.argumentsSchema),
    }),
  }
}
