import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { isCapabilityName } from '@omne-harness-lite/asset-model'
import type {
  Conclusion,
  ConclusionInputs,
  ExtensionInput,
  ExtensionOutput,
  Judgment,
  LoopExtensionDefinition,
  OutputKind,
  Position,
  Rejection,
} from './types.ts'
import { equal, object, snapshot } from './json.ts'
import { rewriteChangesImmutable } from './rewrite.ts'
import { ordinaryShape, validate, type SchemaDefName } from './schema.ts'
import { isPosition, isPower, POSITION_CONCLUSIONS, POWER_CONCLUSIONS } from './tables.ts'

function rejected(value: Rejection): { readonly rejected: Rejection } {
  return Object.freeze({ rejected: value })
}
function outputOf(value: JsonObject): JsonObject | undefined {
  return object(value.output) ? value.output : undefined
}
function aboutOf(value: JsonObject): JsonObject | undefined {
  const output = outputOf(value)
  return output?.kind === 'ask' && object(output.card) && object(output.card.about)
    ? output.card.about
    : undefined
}
function frames(definition: SchemaDefName, value: JsonValue): readonly JsonObject[] {
  if (!object(value)) return []
  if (definition === 'ExtensionInput')
    return [value, ...(Array.isArray(value.earlier) ? value.earlier.filter(object) : [])]
  return ['LoopExtensionDefinition', 'Conclusion'].includes(definition) ? [value] : []
}
function abouts(
  definition: SchemaDefName,
  value: JsonValue,
  contexts: readonly JsonObject[],
): readonly JsonObject[] {
  const all = contexts.map(aboutOf).filter(object)
  if (!object(value)) return all
  if (definition === 'DecisionCardDraft' && object(value.about)) all.push(value.about)
  if (
    ['ExtensionOutput', 'AskOutput'].includes(definition) &&
    value.kind === 'ask' &&
    object(value.card) &&
    object(value.card.about)
  )
    all.push(value.card.about)
  return all
}
function dimensionRejection(frame: JsonObject): Rejection | undefined {
  const needs = frame.position === 'after_model_call' || frame.position === 'after_action'
  if (needs && !Object.hasOwn(frame, 'dimension')) return 'dimension_missing'
  if (Object.hasOwn(frame, 'dimension')) {
    if (!needs || !validate('Dimension', frame.dimension).valid) return 'dimension_not_allowed'
    if (!object(frame.dimension)) return 'dimension_not_allowed'
    if (frame.position === 'after_model_call' && !Object.hasOwn(frame.dimension, 'ending'))
      return 'dimension_not_allowed'
    if (frame.position === 'after_action' && !Object.hasOwn(frame.dimension, 'scope'))
      return 'dimension_not_allowed'
  }
  return undefined
}
function kindsAt(frame: JsonObject): readonly OutputKind[] {
  if (!isPosition(frame.position)) return []
  if (frame.position === 'after_model_call')
    return object(frame.dimension) && frame.dimension.ending === 'failure'
      ? POSITION_CONCLUSIONS.after_model_call.failure
      : POSITION_CONCLUSIONS.after_model_call.complete_reply
  if (frame.position === 'after_action')
    return object(frame.dimension) && frame.dimension.scope === 'batch'
      ? POSITION_CONCLUSIONS.after_action.batch
      : POSITION_CONCLUSIONS.after_action.each
  return POSITION_CONCLUSIONS[frame.position]
}
function knownKind(value: unknown): value is OutputKind {
  return POWER_CONCLUSIONS.veto.some(kind => kind === value)
}
export function subjectDefinition(position: Position, dimension?: JsonValue): SchemaDefName {
  switch (position) {
    case 'attempt_started':
      return 'AttemptStartedSubject'
    case 'before_persist_message':
      return 'BeforePersistMessageSubject'
    case 'after_persist_message':
      return 'AfterPersistMessageSubject'
    case 'before_compaction':
      return 'BeforeCompactionSubject'
    case 'after_compaction':
      return 'AfterCompactionSubject'
    case 'before_model_call':
      return 'BeforeModelCallSubject'
    case 'after_model_call':
      return object(dimension) && dimension.ending === 'failure'
        ? 'AfterModelCallFailureSubject'
        : 'AfterModelCallCompleteReplySubject'
    case 'before_action':
      return 'BeforeActionSubject'
    case 'after_action':
      return object(dimension) && dimension.scope === 'batch'
        ? 'AfterActionBatchSubject'
        : 'AfterActionEachSubject'
    case 'before_terminal':
      return 'BeforeTerminalSubject'
    case 'after_terminal':
      return 'AfterTerminalSubject'
  }
}
function injectSourceMismatch(output: JsonObject, name?: JsonValue): boolean {
  if (output.kind !== 'inject' || !object(output.message) || !object(output.message.source))
    return false
  const source = output.message.source
  return source.kind !== 'extension' || (name !== undefined && source.extension !== name)
}
/** Representation judgment. Input-dependent immutable comparisons are added by judgeConclusion. */
export function judgeValue(definition: SchemaDefName, value: unknown): Judgment<JsonValue> {
  const copied = snapshot(value)
  if (copied === undefined || !ordinaryShape(definition, copied)) return rejected('malformed')
  const contexts = frames(definition, copied)
  for (const frame of contexts) {
    const about = aboutOf(frame)
    if (about !== undefined && (about.position !== frame.position || about.callId !== frame.callId))
      return rejected('malformed')
  }
  if (definition === 'LoopPosition' && !isPosition(copied)) return rejected('position_unknown')
  const allAbouts = abouts(definition, copied, contexts)
  if (
    contexts.some(frame => !isPosition(frame.position)) ||
    allAbouts.some(about => !isPosition(about.position))
  )
    return rejected('position_unknown')
  if (definition === 'Power' && !isPower(copied)) return rejected('power_unknown')
  if (contexts.some(frame => Object.hasOwn(frame, 'power') && !isPower(frame.power)))
    return rejected('power_unknown')
  if (contexts.some(frame => dimensionRejection(frame) === 'dimension_missing'))
    return rejected('dimension_missing')
  if (
    (definition === 'Dimension' && !validate('Dimension', copied).valid) ||
    contexts.some(frame => dimensionRejection(frame) === 'dimension_not_allowed')
  )
    return rejected('dimension_not_allowed')
  for (const frame of contexts) {
    const output = outputOf(frame)
    if (
      output !== undefined &&
      knownKind(output.kind) &&
      isPower(frame.power) &&
      !POWER_CONCLUSIONS[frame.power].includes(output.kind)
    )
      return rejected('output_not_allowed_for_power')
  }
  if (
    contexts.some(
      frame =>
        outputOf(frame)?.kind === 'ask' &&
        ['before_persist_message', 'after_terminal'].includes(String(frame.position)),
    )
  )
    return rejected('ask_at_forbidden_position')
  for (const frame of contexts) {
    const output = outputOf(frame)
    if (output !== undefined && knownKind(output.kind) && !kindsAt(frame).includes(output.kind))
      return rejected('output_not_allowed_at_position')
  }
  for (const frame of contexts) {
    const output = outputOf(frame)
    if (
      output?.kind === 'rewrite' &&
      isPosition(frame.position) &&
      !validate(subjectDefinition(frame.position, frame.dimension), output.subject).valid
    )
      return rejected('rewrite_touches_immutable')
  }
  if (
    contexts.some(frame => {
      const output = outputOf(frame)
      return output !== undefined && injectSourceMismatch(output, frame.extension)
    })
  )
    return rejected('inject_source_mismatch')
  if (
    object(copied) &&
    ['ExtensionOutput', 'InjectOutput'].includes(definition) &&
    injectSourceMismatch(copied)
  )
    return rejected('inject_source_mismatch')
  if (!validate(definition, copied).valid) return rejected('malformed')
  return Object.freeze({ ok: copied })
}
export function isLoopExtensionDefinition(value: unknown): value is LoopExtensionDefinition {
  return validate('LoopExtensionDefinition', value).valid
}
export function isExtensionInput(value: unknown): value is ExtensionInput {
  return validate('ExtensionInput', value).valid
}
export function isExtensionOutput(value: unknown): value is ExtensionOutput {
  return validate('ExtensionOutput', value).valid
}
export function isConclusion(value: unknown): value is Conclusion {
  return validate('Conclusion', value).valid
}
export function judgeDefinition(value: unknown): Judgment<LoopExtensionDefinition> {
  const result = judgeValue('LoopExtensionDefinition', value)
  if ('rejected' in result) return result
  if (!isLoopExtensionDefinition(result.ok))
    throw new Error('inconsistent loop definition judgment')
  return Object.freeze({ ok: result.ok })
}
export function judgeInput(value: unknown): Judgment<ExtensionInput> {
  const result = judgeValue('ExtensionInput', value)
  if ('rejected' in result) return result
  if (!isExtensionInput(result.ok)) throw new Error('inconsistent loop input judgment')
  return Object.freeze({ ok: result.ok })
}
export function judgeOutput(value: unknown): Judgment<ExtensionOutput> {
  const result = judgeValue('ExtensionOutput', value)
  if ('rejected' in result) return result
  if (!isExtensionOutput(result.ok)) throw new Error('inconsistent loop output judgment')
  return Object.freeze({ ok: result.ok })
}

/**
 * S-37 domain refusals precede auxiliary-configuration checks. TypeError means
 * caller-admitted inputs/pairing are missing or invalid, never an eleventh refusal.
 * The caller owns actual invocation provenance beyond these observable values.
 */
export function judgeConclusion(value: unknown, inputs: ConclusionInputs): Judgment<Conclusion> {
  const record = snapshot(value)
  if (record === undefined || !ordinaryShape('Conclusion', record) || !object(record))
    return rejected('malformed')
  const about = aboutOf(record)
  if (about !== undefined && (about.position !== record.position || about.callId !== record.callId))
    return rejected('malformed')
  const supplied = snapshot(inputs)
  if (
    object(supplied) &&
    isCapabilityName(supplied.extensionName) &&
    record.extension !== supplied.extensionName
  )
    return rejected('malformed')
  const representation = judgeValue('Conclusion', record)
  if ('rejected' in representation) return representation
  if (
    !object(supplied) ||
    Object.keys(supplied).length !== 2 ||
    !Object.hasOwn(supplied, 'input') ||
    !isCapabilityName(supplied.extensionName)
  )
    throw new TypeError('admitted ConclusionInputs required')
  const admitted = judgeInput(supplied.input)
  if ('rejected' in admitted) throw new TypeError('ConclusionInputs.input is not admitted')
  const input = snapshot(admitted.ok)
  if (!object(input) || !object(input.subject)) throw new Error('admitted input has no subject')
  const callId =
    input.position === 'before_action' && object(input.subject.call)
      ? input.subject.call.callId
      : input.position === 'after_action' &&
          object(input.dimension) &&
          input.dimension.scope === 'each'
        ? input.subject.callId
        : undefined
  if (
    record.position !== input.position ||
    !equal(record.dimension, input.dimension) ||
    !equal(record.callId, callId)
  )
    throw new TypeError('ConclusionInputs must pair with this invocation')
  const output = outputOf(record)
  if (
    output?.kind === 'rewrite' &&
    object(output.subject) &&
    isPosition(record.position) &&
    rewriteChangesImmutable(record.position, input.subject, output.subject)
  )
    return rejected('rewrite_touches_immutable')
  if (!isConclusion(record)) throw new Error('inconsistent conclusion judgment')
  return Object.freeze({ ok: record })
}
