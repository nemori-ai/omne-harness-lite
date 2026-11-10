// The only entry of the gateway engine: one record, its hooks and its meter become the complete
// accepted family binding.
import type { RouteAccounting } from '../config.ts'
import type { Adoption, FixedModelRequest, Supplier } from '@omne-harness/model-contract'
import { recordAdoption } from '../family-table.ts'
import { isPositiveInteger } from '../limits.ts'
import type { PiFamilyBinding } from '../family.ts'
import { createChatCompletionsDecoder } from './decoder.ts'
import { GATEWAY_FIELDS } from './gateway.ts'
import { defaultParameter, judgeParameter, PARAMETER_KINDS } from './parameters.ts'
import { convertTool, recordDeclaration } from './projection.ts'
import { encodeRequest, planRequest, type RequestContext } from './request.ts'
import { TOOL_NAME_RULES, toolNamesOf, type ToolNames } from './tool-names.ts'
import type {
  ChatCompletionsLimits,
  ChatCompletionsRecord,
  FamilyMeter,
  GatewayField,
  ParameterTable,
  VendorHooks,
} from './vocabulary.ts'

export type ChatCompletionsBindingInput = Readonly<{
  record: ChatCompletionsRecord
  supplier: Supplier
  hooks: VendorHooks
  meter: FamilyMeter
  /** The buffer limits of each decoder of the binding. From the family configuration. */
  limits: ChatCompletionsLimits
  /** Releases what the family acquired for this binding. Called at most once. */
  release(): Promise<void>
}>

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

/** The gateway fields that the parameter table writes. */
function parameterFields(table: ParameterTable): readonly GatewayField[] {
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

/**
 * Checks what the engine relies on and the type cannot state. Throws `RangeError`: a record or a
 * binding input that fails is a defect of the family package.
 */
function checkInput(input: ChatCompletionsBindingInput, adoption: Adoption): void {
  const { record, supplier, meter } = input
  if (!sameAdoption(adoption, supplier.adoption))
    throw new RangeError(`record ${record.name} does not have the adoption of the supplier`)
  if (record.route.provider !== supplier.provider || record.route.model !== supplier.model)
    throw new RangeError(`record ${record.name} does not have the route of the supplier`)
  if (!sameAdoption(meter.instance.basis.supplier.adoption, adoption))
    throw new RangeError(`the meter of record ${record.name} counts for another supplier`)
  // Throws for an official declaration that is not valid; plan and encode do not use it.
  recordDeclaration(record)
  const { produces, accepts } = record.replay.formats
  if (!accepts.includes(produces))
    throw new RangeError(`record ${record.name}: replay formats must accept what they produce`)
  if (!Number.isSafeInteger(record.wire.usageTail.maxFrames) || record.wire.usageTail.maxFrames < 0)
    throw new RangeError(
      `record ${record.name}: usageTail.maxFrames must be a non-negative integer`,
    )
  checkToolNames(record)
  for (const kind of PARAMETER_KINDS) {
    const fallback = defaultParameter(record.parameters, kind)
    if (fallback === null) continue
    const failure = judgeParameter(fallback, { record, adapter: adoption, outputLimit: null })
    if (failure !== null)
      throw new RangeError(`record ${record.name}: the default of ${kind} is ${failure.kind}`)
  }
  checkFields(record)
  checkLimits(input.limits)
}

/** The tool name rule of the record is an engine rule, and its length a positive integer. */
function checkToolNames(record: ChatCompletionsRecord): void {
  const { toolNames } = record.wire
  if (typeof toolNames !== 'object' || toolNames === null)
    throw new RangeError(`record ${record.name}: wire.toolNames must be an object`)
  if (!TOOL_NAME_RULES.includes(toolNames.rule))
    throw new RangeError(`record ${record.name}: wire.toolNames.rule is not an engine rule`)
  if (!isPositiveInteger(toolNames.maxLength))
    throw new RangeError(
      `record ${record.name}: wire.toolNames.maxLength must be a positive integer`,
    )
}

const JSON_LIMIT_NAMES = [
  'maxBytes',
  'maxDepth',
  'maxItems',
  'maxMembers',
  'maxStringLength',
  'maxNumberLength',
] as const satisfies readonly (keyof ChatCompletionsLimits['toolArguments'])[]

function checkLimits(limits: ChatCompletionsLimits): void {
  if (typeof limits !== 'object' || limits === null)
    throw new RangeError('limits must be an object')
  if (!isPositiveInteger(limits.maxReasoningText))
    throw new RangeError('limits.maxReasoningText must be a positive integer')
  if (typeof limits.toolArguments !== 'object' || limits.toolArguments === null)
    throw new RangeError('limits.toolArguments must be an object')
  for (const name of JSON_LIMIT_NAMES)
    if (!isPositiveInteger(limits.toolArguments[name]))
      throw new RangeError(`limits.toolArguments.${name} must be a positive integer`)
}

/** Each gateway field has one writer: a parameter, an extension or a fixed value. */
function checkFields(record: ChatCompletionsRecord): void {
  const known = new Set<string>(GATEWAY_FIELDS)
  const owned = new Set(parameterFields(record.parameters))
  const claim = (field: GatewayField, what: string): void => {
    if (!known.has(field))
      throw new RangeError(`record ${record.name}: ${what} names unknown field ${field}`)
    if (owned.has(field))
      throw new RangeError(`record ${record.name}: ${what} writes ${field} a second time`)
    owned.add(field)
  }
  for (const rule of record.extensions) claim(rule.field, 'an extension')
  for (const param of record.wire.fixed) claim(param.field, 'a fixed value')
}

/**
 * The tool names of the request whose response the decoder reads: the table that encode used.
 * Throws for a request whose names encode refuses: no decoder is made for a request that was not
 * sent.
 */
function decoderNames(
  record: ChatCompletionsRecord,
  adapter: Adoption,
  request: FixedModelRequest,
): ToolNames {
  const names = toolNamesOf({
    profile: record.wire.toolNames,
    tools: request.tools,
    messages: request.messages,
    adapter,
  })
  if (!('ok' in names))
    throw new RangeError(
      `the request of a decoder has tool names that encode refuses: ${names.failure.kind}`,
    )
  return names.ok
}

/**
 * Builds the complete binding of one record. Pure: no environment, secret, network or file.
 * `counting` is `meter.instance.basis`, and `replayFormat` is `record.replay.formats.produces`.
 * `release` wraps the release of the family once: every call returns the promise of the first.
 * Throws `RangeError` for a record or an input that the engine cannot bind.
 */
export function bindChatCompletions(input: ChatCompletionsBindingInput): PiFamilyBinding {
  const { record, supplier, hooks, meter } = input
  const adoption = recordAdoption(supplier.adoption.owner, record)
  checkInput(input, adoption)
  const limits = Object.freeze({
    toolArguments: Object.freeze({ ...input.limits.toolArguments }),
    maxReasoningText: input.limits.maxReasoningText,
  })
  const context: RequestContext = {
    record,
    hooks,
    meter,
    supplier,
    adapter: adoption,
  }
  let released: Promise<void> | undefined
  return Object.freeze({
    supplier,
    adoption,
    counting: meter.instance.basis,
    rules: Object.freeze({
      plan: (planInput: Parameters<typeof planRequest>[1]) => planRequest(context, planInput),
    }),
    meter: meter.instance,
    replayFormat: record.replay.formats.produces,
    tools: Object.freeze({
      convertToModelPayload: (declaration: Parameters<typeof convertTool>[0]) =>
        convertTool(declaration, hooks, record.wire.toolNames, adoption),
    }),
    encode: (encodeInput: Parameters<typeof encodeRequest>[1]) =>
      encodeRequest(context, encodeInput),
    createDecoder: ({
      request,
      accounting,
    }: Readonly<{ request: FixedModelRequest; accounting: RouteAccounting }>) =>
      createChatCompletionsDecoder({
        record,
        accounting,
        hooks,
        limits,
        names: decoderNames(record, adoption, request),
      }),
    release(): Promise<void> {
      released ??= input.release()
      return released
    },
  } satisfies PiFamilyBinding)
}
