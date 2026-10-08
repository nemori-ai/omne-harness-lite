import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { isCapabilityName } from '@omne-harness-lite/asset-model'
import { judgeModelInvocationRecord } from '@omne-harness-lite/messages'
import type {
  Conclusion,
  ConclusionInputs,
  ConclusionSubjectInputs,
  ExtensionInput,
  ExtensionOutput,
  Judgment,
  LoopExtensionDefinition,
  OutputKind,
  Position,
  PositionedSubject,
  Rejection,
} from './types.ts'
import { equal, object, snapshot } from './json.ts'
import { rewriteChangesImmutable } from './rewrite.ts'
import { ordinaryShape, validate, type SchemaDefName } from './schema.ts'
import { isPosition, isPower, POSITION_CONCLUSIONS, POWER_CONCLUSIONS } from './tables.ts'
import {
  conclusionFromRepresentation,
  inputFromRepresentation,
  positionedFromRepresentation,
  outputFromRepresentation,
} from './values.ts'

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
function modelCallSubjectDefinition(dimension?: JsonValue): SchemaDefName {
  return object(dimension) && dimension.ending === 'failure'
    ? 'AfterModelCallFailureSubject'
    : 'AfterModelCallCompleteReplySubject'
}
function actionSubjectDefinition(dimension?: JsonValue): SchemaDefName {
  return object(dimension) && dimension.scope === 'batch'
    ? 'AfterActionBatchSubject'
    : 'AfterActionEachSubject'
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
      return modelCallSubjectDefinition(dimension)
    case 'before_action':
      return 'BeforeActionSubject'
    case 'after_action':
      return actionSubjectDefinition(dimension)
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

function appendInputSubjects(
  value: JsonObject,
  result: JsonObject[],
  rewrittenSubject: (frame: JsonObject) => void,
): void {
  if (object(value.subject)) result.push(value.subject)
  for (const earlier of Array.isArray(value.earlier) ? value.earlier : [])
    if (object(earlier)) rewrittenSubject(earlier)
}
/** Visit only protocol subject slots, leaving arbitrary configuration and opaque JSON untouched. */
function dispatchedSubjects(definition: SchemaDefName, value: JsonValue): readonly JsonObject[] {
  if (!object(value)) return []
  if (definition === 'AfterModelCallFailureSubject' || definition === 'Subject') return [value]
  const result: JsonObject[] = []
  const rewrittenSubject = (frame: JsonObject): void => {
    const output = outputOf(frame)
    if (output?.kind === 'rewrite' && object(output.subject)) result.push(output.subject)
  }
  if (definition === 'ExtensionInput') appendInputSubjects(value, result, rewrittenSubject)
  if (definition === 'Conclusion') rewrittenSubject(value)
  if (
    (definition === 'RewriteOutput' || definition === 'ExtensionOutput') &&
    value.kind === 'rewrite' &&
    object(value.subject)
  )
    result.push(value.subject)
  return result
}
function failureCallAssociation(subject: JsonObject): boolean {
  if (!Array.isArray(subject.dispatches) || subject.dispatches.length === 0) return false
  const first = subject.dispatches[0]
  if (!object(first) || typeof first.call !== 'string') return false
  if (subject.dispatches.some(item => !object(item) || item.call !== first.call)) return false
  if (!Array.isArray(subject.retryConclusions)) return false
  return subject.retryConclusions.every(item => object(item) && item.modelCallId === first.call)
}

function admitRepresentation(definition: SchemaDefName, value: unknown): Judgment<JsonValue> {
  const copied = snapshot(value)
  if (copied === undefined || !ordinaryShape(definition, copied)) return rejected('malformed')
  for (const subject of dispatchedSubjects(definition, copied))
    if (Array.isArray(subject.dispatches)) {
      if (!failureCallAssociation(subject)) return rejected('malformed')
      for (const dispatch of subject.dispatches) {
        const record = judgeModelInvocationRecord(dispatch)
        if (!('ok' in record) || record.ok.kind !== 'model_call_dispatched')
          return rejected('malformed')
      }
    }
  return Object.freeze({ ok: copied })
}
function mismatchedFrameAbout(contexts: readonly JsonObject[]): boolean {
  for (const frame of contexts) {
    const about = aboutOf(frame)
    if (about !== undefined && (about.position !== frame.position || about.callId !== frame.callId))
      return true
  }
  return false
}
function positionPowerRejection(
  definition: SchemaDefName,
  copied: JsonValue,
  contexts: readonly JsonObject[],
): Rejection | undefined {
  if (definition === 'LoopPosition' && !isPosition(copied)) return 'position_unknown'
  const allAbouts = abouts(definition, copied, contexts)
  if (
    contexts.some(frame => !isPosition(frame.position)) ||
    allAbouts.some(about => !isPosition(about.position))
  )
    return 'position_unknown'
  if (definition === 'Power' && !isPower(copied)) return 'power_unknown'
  if (contexts.some(frame => Object.hasOwn(frame, 'power') && !isPower(frame.power)))
    return 'power_unknown'
  return undefined
}
function dimensionValueRejection(
  definition: SchemaDefName,
  copied: JsonValue,
  contexts: readonly JsonObject[],
): Rejection | undefined {
  if (contexts.some(frame => dimensionRejection(frame) === 'dimension_missing'))
    return 'dimension_missing'
  if (
    (definition === 'Dimension' && !validate('Dimension', copied).valid) ||
    contexts.some(frame => dimensionRejection(frame) === 'dimension_not_allowed')
  )
    return 'dimension_not_allowed'
  return undefined
}
function outputPowerRejection(contexts: readonly JsonObject[]): Rejection | undefined {
  for (const frame of contexts) {
    const output = outputOf(frame)
    if (
      output !== undefined &&
      knownKind(output.kind) &&
      isPower(frame.power) &&
      !POWER_CONCLUSIONS[frame.power].includes(output.kind)
    )
      return 'output_not_allowed_for_power'
  }
  return undefined
}
function outputPositionRejection(contexts: readonly JsonObject[]): Rejection | undefined {
  if (
    contexts.some(
      frame =>
        outputOf(frame)?.kind === 'ask' &&
        ['before_persist_message', 'after_terminal'].includes(String(frame.position)),
    )
  )
    return 'ask_at_forbidden_position'
  for (const frame of contexts) {
    const output = outputOf(frame)
    if (output !== undefined && knownKind(output.kind) && !kindsAt(frame).includes(output.kind))
      return 'output_not_allowed_at_position'
  }
  return undefined
}
function rewriteShapeRejection(contexts: readonly JsonObject[]): Rejection | undefined {
  for (const frame of contexts) {
    const output = outputOf(frame)
    if (
      output?.kind === 'rewrite' &&
      isPosition(frame.position) &&
      !validate(subjectDefinition(frame.position, frame.dimension), output.subject).valid
    )
      return 'rewrite_touches_immutable'
  }
  return undefined
}
function injectOutputRejection(
  definition: SchemaDefName,
  copied: JsonValue,
  contexts: readonly JsonObject[],
): Rejection | undefined {
  if (
    contexts.some(frame => {
      const output = outputOf(frame)
      return output !== undefined && injectSourceMismatch(output, frame.extension)
    })
  )
    return 'inject_source_mismatch'
  if (
    object(copied) &&
    ['ExtensionOutput', 'InjectOutput'].includes(definition) &&
    injectSourceMismatch(copied)
  )
    return 'inject_source_mismatch'
  return undefined
}
/** Representation judgment. Input-dependent immutable comparisons are added by judgeConclusion. */
export function judgeValue(definition: SchemaDefName, value: unknown): Judgment<JsonValue> {
  const admitted = admitRepresentation(definition, value)
  if ('rejected' in admitted) return admitted
  const copied = admitted.ok
  const contexts = frames(definition, copied)
  if (mismatchedFrameAbout(contexts)) return rejected('malformed')
  const positionPower = positionPowerRejection(definition, copied, contexts)
  if (positionPower !== undefined) return rejected(positionPower)
  const dimensionValue = dimensionValueRejection(definition, copied, contexts)
  if (dimensionValue !== undefined) return rejected(dimensionValue)
  const outputPower = outputPowerRejection(contexts)
  if (outputPower !== undefined) return rejected(outputPower)
  const outputPosition = outputPositionRejection(contexts)
  if (outputPosition !== undefined) return rejected(outputPosition)
  const rewriteShape = rewriteShapeRejection(contexts)
  if (rewriteShape !== undefined) return rejected(rewriteShape)
  const injectOutput = injectOutputRejection(definition, copied, contexts)
  if (injectOutput !== undefined) return rejected(injectOutput)
  if (!validate(definition, copied).valid) return rejected('malformed')
  return Object.freeze({ ok: copied })
}
export function isLoopExtensionDefinition(value: unknown): value is LoopExtensionDefinition {
  return validate('LoopExtensionDefinition', value).valid
}
/** Shape checks do not brand the caller's original representation. */
export function isExtensionInput(value: unknown): boolean {
  return validate('ExtensionInput', value).valid
}
export function isExtensionOutput(value: unknown): boolean {
  return validate('ExtensionOutput', value).valid
}
export function isConclusion(value: unknown): boolean {
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
  return Object.freeze({ ok: inputFromRepresentation(result.ok) })
}
/** Check only the position, dimension, and corresponding subject value. */
export function judgePositionedSubject(value: unknown): Judgment<PositionedSubject> {
  const record = snapshot(value)
  if (
    !object(record) ||
    !Object.hasOwn(record, 'position') ||
    !Object.hasOwn(record, 'subject') ||
    Object.keys(record).some(key => !['position', 'dimension', 'subject'].includes(key)) ||
    !object(record.subject) ||
    !ordinaryShape('Subject', record.subject)
  )
    return rejected('malformed')
  if (!isPosition(record.position)) return rejected('position_unknown')
  const dimension = dimensionRejection(record)
  if (dimension !== undefined) return rejected(dimension)
  const judged = judgeValue(subjectDefinition(record.position, record.dimension), record.subject)
  if ('rejected' in judged) return judged
  return Object.freeze({ ok: positionedFromRepresentation(record) })
}
export function judgeOutput(value: unknown): Judgment<ExtensionOutput> {
  const result = judgeValue('ExtensionOutput', value)
  if ('rejected' in result) return result
  return Object.freeze({ ok: outputFromRepresentation(result.ok) })
}

function actualNameMismatch(record: JsonObject, inputs: unknown): boolean {
  const nameDescriptor = object(inputs)
    ? Object.getOwnPropertyDescriptor(inputs, 'extensionName')
    : undefined
  const actualName: unknown =
    nameDescriptor !== undefined && 'value' in nameDescriptor ? nameDescriptor.value : undefined
  if (isCapabilityName(actualName) && record.extension !== actualName) return true
  return false
}
/**
 * S-37 domain refusals precede auxiliary-configuration checks. TypeError means
 * caller-admitted inputs/pairing are missing or invalid, never an eleventh refusal.
 * The caller owns actual invocation provenance beyond these observable values.
 */
function conclusionRecord(value: unknown, inputs: unknown): Judgment<JsonObject> {
  const record = snapshot(value)
  if (record === undefined || !ordinaryShape('Conclusion', record) || !object(record))
    return rejected('malformed')
  const about = aboutOf(record)
  if (about !== undefined && (about.position !== record.position || about.callId !== record.callId))
    return rejected('malformed')
  if (actualNameMismatch(record, inputs)) return rejected('malformed')
  const representation = judgeValue('Conclusion', record)
  if ('rejected' in representation) return representation
  return Object.freeze({ ok: record })
}
function failurePairMismatch(
  record: JsonObject,
  input: JsonObject,
  inputSubject: JsonObject,
): boolean {
  if (
    input.position === 'after_model_call' &&
    object(input.dimension) &&
    input.dimension.ending === 'failure'
  ) {
    if (!failureCallAssociation(inputSubject)) return true
    const dispatches = inputSubject.dispatches
    if (!Array.isArray(dispatches)) return true
    const firstDispatch = dispatches[0]
    if (!object(firstDispatch) || record.modelCallId !== firstDispatch.call) return true
  }
  return false
}
function pairedCallId(input: JsonObject, inputSubject: JsonObject): JsonValue | undefined {
  return input.position === 'before_action' && object(inputSubject.call)
    ? inputSubject.call.callId
    : input.position === 'after_action' &&
        object(input.dimension) &&
        input.dimension.scope === 'each'
      ? inputSubject.callId
      : undefined
}
function pairedRewriteChangesImmutable(record: JsonObject, inputSubject: JsonObject): boolean {
  const output = outputOf(record)
  if (
    output?.kind === 'rewrite' &&
    object(output.subject) &&
    isPosition(record.position) &&
    rewriteChangesImmutable(record.position, inputSubject, output.subject)
  )
    return true
  return false
}
function pairConclusion(record: JsonObject, subject: PositionedSubject): Judgment<Conclusion> {
  const input = snapshot(subject)
  if (!object(input) || !object(input.subject)) throw new Error('admitted subject has no value')
  if (failurePairMismatch(record, input, input.subject)) return rejected('malformed')
  const callId = pairedCallId(input, input.subject)
  if (
    record.position !== input.position ||
    !equal(record.dimension, input.dimension) ||
    !equal(record.callId, callId)
  )
    throw new TypeError('ConclusionInputs must pair with this invocation')
  if (pairedRewriteChangesImmutable(record, input.subject))
    return rejected('rewrite_touches_immutable')
  return Object.freeze({ ok: conclusionFromRepresentation(record) })
}

export function judgeConclusion(value: unknown, inputs: ConclusionInputs): Judgment<Conclusion> {
  const candidate = conclusionRecord(value, inputs)
  if ('rejected' in candidate) return candidate
  const supplied = snapshot(inputs)
  if (
    !object(supplied) ||
    Object.keys(supplied).length !== 2 ||
    !Object.hasOwn(supplied, 'input') ||
    !isCapabilityName(supplied.extensionName)
  )
    throw new TypeError('admitted ConclusionInputs required')
  const admitted = judgeInput(supplied.input)
  if ('rejected' in admitted) throw new TypeError('ConclusionInputs.input is not admitted')
  return pairConclusion(candidate.ok, admitted.ok)
}

export function judgeConclusionForSubject(
  value: unknown,
  inputs: ConclusionSubjectInputs,
): Judgment<Conclusion> {
  const candidate = conclusionRecord(value, inputs)
  if ('rejected' in candidate) return candidate
  const supplied = snapshot(inputs)
  if (
    !object(supplied) ||
    Object.keys(supplied).length !== 2 ||
    !Object.hasOwn(supplied, 'positionedSubject') ||
    !isCapabilityName(supplied.extensionName)
  )
    throw new TypeError('admitted ConclusionSubjectInputs required')
  const admitted = judgePositionedSubject(supplied.positionedSubject)
  if ('rejected' in admitted)
    throw new TypeError('ConclusionSubjectInputs.positionedSubject is not admitted')
  return pairConclusion(candidate.ok, admitted.ok)
}
