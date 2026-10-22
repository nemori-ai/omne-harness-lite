import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { decodeRevision } from '@omne-harness/model-contract'
import { parseRecordEntryRef, parseMessageId } from '@omne-harness/message'
import { decodeEpochId, decodeBatchRef } from './refs.js'
import { PREFIX_BREAK_REASONS, type Coverage } from './values.js'
import { record, integer, revision, adoption, isEvidence } from './schema-primitives.js'
function ref(value: unknown): boolean {
  return typeof value === 'string' && parseRecordEntryRef(value) !== null
}
function scope(value: unknown): boolean {
  return !('failure' in decodeScopeRef(value))
}
function stringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(x => typeof x === 'string')
}
function reference(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.storage === 'string' &&
    typeof value.key === 'string' &&
    typeof value.mediaType === 'string' &&
    integer(value.bytes) &&
    typeof value.digest === 'string'
  )
}
function alteration(value: unknown): boolean {
  return (
    record(value) &&
    isEvidence(value.evidence) &&
    (value.touches === 'existing-layers' || value.touches === 'history-tail')
  )
}
function representation(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.message === 'string' &&
    parseMessageId(value.message).ok &&
    typeof value.block === 'string' &&
    value.block.length > 0 &&
    ['original', 'derived', 'transcript', 'pending-load'].includes(String(value.choice)) &&
    (value.converter === null || adoption(value.converter)) &&
    (value.mediaType === null || typeof value.mediaType === 'string')
  )
}

function history(value: unknown): boolean {
  return (
    record(value) &&
    !('failure' in decodeEpochId(value.epoch)) &&
    Number.isSafeInteger(value.upper) &&
    Array.isArray(value.anchors) &&
    value.anchors.every(anchor)
  )
}
function anchor(value: unknown): boolean {
  return (
    record(value) &&
    ['history-head', 'snapshot-reminder', 'history-body'].includes(String(value.layer)) &&
    Number.isSafeInteger(value.seq) &&
    typeof value.prefixDigest === 'string'
  )
}
function compactions(value: unknown): boolean {
  return (
    record(value) &&
    (value.record === null || ref(value.record)) &&
    (value.derivation === null || typeof value.derivation === 'string')
  )
}
function inputs(value: unknown): boolean {
  return (
    record(value) &&
    !('failure' in decodeBatchRef(value.batch)) &&
    (value.saved === null || isEvidence(value.saved))
  )
}
function snapshotAnchor(value: unknown): boolean {
  return (
    record(value) &&
    !('failure' in decodeEpochId(value.epoch)) &&
    Number.isSafeInteger(value.seq) &&
    (typeof value.prefixDigest === 'string' || value.prefixDigest === null)
  )
}
function snapshot(value: unknown): boolean {
  return (
    record(value) &&
    scope(value.scope) &&
    record(value.eligibility) &&
    typeof value.eligibility.eligibility === 'string' &&
    revision(value.revision) &&
    snapshotAnchor(value.anchor) &&
    (value.content === 'full' || value.content === 'incremental')
  )
}
function section(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    (value.scope === null || scope(value.scope)) &&
    adoption(value.source) &&
    typeof value.revision === 'string'
  )
}
function prompt(value: unknown): boolean {
  return (
    record(value) &&
    Array.isArray(value.sections) &&
    value.sections.every(section) &&
    typeof value.digest === 'string' &&
    (value.generation === null || typeof value.generation === 'string')
  )
}
function model(value: unknown): boolean {
  return (
    record(value) &&
    adoption(value.profile) &&
    !('failure' in decodeRevision(value.revision)) &&
    typeof value.recipient === 'string' &&
    typeof value.parametersDigest === 'string' &&
    (value.replay === 'on' || value.replay === 'off')
  )
}
function tools(value: unknown): boolean {
  return (
    record(value) &&
    stringList(value.direct) &&
    stringList(value.programmatic) &&
    typeof value.digest === 'string'
  )
}
function conditions(value: unknown): boolean {
  return record(value) && isEvidence(value.evidence) && typeof value.revision === 'string'
}
function budget(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.inputDigest === 'string' &&
    (value.kind === 'complete' || value.kind === 'deferred-media') &&
    Array.isArray(value.deferred) &&
    value.deferred.every(reference) &&
    stringList(value.unknownLimits)
  )
}
function list(value: unknown, item: (value: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(item)
}
export function isCoverage(value: unknown): value is Coverage {
  if (!record(value)) return false
  const groups = [
    history(value.history),
    compactions(value.compactions),
    inputs(value.inputs),
    snapshot(value.snapshot),
    prompt(value.prompt),
    model(value.model),
    tools(value.tools),
    conditions(value.conditions),
  ]
  return (
    groups.every(Boolean) &&
    list(value.alterations, alteration) &&
    list(value.representations, representation) &&
    budget(value.budget) &&
    PREFIX_BREAK_REASONS.some(reason => reason === String(value.prefixBreak))
  )
}
