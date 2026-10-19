// Runtime values of the chapter "根入口的值与请求". This file imports types only from the chapter
// files, so the type imports between chapters never see runtime code.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelDiagnosticCursor, ModelDiagnosticId } from './diagnostics.ts'
import { mintIdentity } from './mint.ts'
import type {
  DispatchId,
  Identity,
  ModelCallId,
  ModelIdentityKey,
  ModelIdentityRejection,
  ModelInstanceId,
  ModelOperationId,
  ReadId,
  OutputCursor,
  ResultVersion,
  Revision,
} from './root.ts'

export const MODEL_IDENTITY_MAX_LENGTH = 256

export const MODEL_IDENTITY_PREFIXES: Readonly<{
  ModelCallId: 'mcall_'
  ModelDispatchId: 'mdisp_'
  ModelInstanceId: 'minst_'
  ModelOperationId: 'mop_'
  ModelResultVersion: 'mrver_'
  ModelReadId: 'mread_'
  ModelDiagnosticId: 'mdiag_'
  ModelDiagnosticCursor: 'mdcur_'
}> = Object.freeze({
  ModelCallId: 'mcall_',
  ModelDispatchId: 'mdisp_',
  ModelInstanceId: 'minst_',
  ModelOperationId: 'mop_',
  ModelResultVersion: 'mrver_',
  ModelReadId: 'mread_',
  ModelDiagnosticId: 'mdiag_',
  ModelDiagnosticCursor: 'mdcur_',
})

const SEQUENCE_TEXT = /^[0-9]+$/u
const PREFIXED_BODY = /^[A-Za-z0-9_-]+$/u

type Reason = ModelIdentityRejection<ModelIdentityKey>['reason']
type SequenceKey = 'ModelRevision' | 'ModelOutputCursor'
type PrefixedKey = keyof typeof MODEL_IDENTITY_PREFIXES

function reject<K extends ModelIdentityKey>(field: K, reason: Reason) {
  return fail<ModelIdentityRejection<K>>({ field, reason })
}

// The checks run in the order of ModelIdentityRejection['reason'] and the first failure wins.
function decodePrefixed<K extends PrefixedKey>(
  key: K,
  text: unknown,
): Outcome<Identity<K>, ModelIdentityRejection<K>> {
  if (typeof text !== 'string') return reject(key, 'type')
  if (text.length === 0) return reject(key, 'empty')
  if (text.length > MODEL_IDENTITY_MAX_LENGTH) return reject(key, 'length')
  const prefix = MODEL_IDENTITY_PREFIXES[key]
  if (!text.startsWith(prefix) || text.length === prefix.length) return reject(key, 'prefix')
  if (!PREFIXED_BODY.test(text.slice(prefix.length))) return reject(key, 'character')
  return succeed(mintIdentity<K>(text))
}

export function decodeModelCallId(
  text: unknown,
): Outcome<ModelCallId, ModelIdentityRejection<'ModelCallId'>> {
  return decodePrefixed('ModelCallId', text)
}

export function decodeDispatchId(
  text: unknown,
): Outcome<DispatchId, ModelIdentityRejection<'ModelDispatchId'>> {
  return decodePrefixed('ModelDispatchId', text)
}

export function decodeModelInstanceId(
  text: unknown,
): Outcome<ModelInstanceId, ModelIdentityRejection<'ModelInstanceId'>> {
  return decodePrefixed('ModelInstanceId', text)
}

export function decodeModelOperationId(
  text: unknown,
): Outcome<ModelOperationId, ModelIdentityRejection<'ModelOperationId'>> {
  return decodePrefixed('ModelOperationId', text)
}

export function decodeReadId(
  text: unknown,
): Outcome<ReadId, ModelIdentityRejection<'ModelReadId'>> {
  return decodePrefixed('ModelReadId', text)
}

export function decodeResultVersion(
  text: unknown,
): Outcome<ResultVersion, ModelIdentityRejection<'ModelResultVersion'>> {
  return decodePrefixed('ModelResultVersion', text)
}

export function decodeModelDiagnosticId(
  text: unknown,
): Outcome<ModelDiagnosticId, ModelIdentityRejection<'ModelDiagnosticId'>> {
  return decodePrefixed('ModelDiagnosticId', text)
}

export function decodeModelDiagnosticCursor(
  text: unknown,
): Outcome<ModelDiagnosticCursor, ModelIdentityRejection<'ModelDiagnosticCursor'>> {
  return decodePrefixed('ModelDiagnosticCursor', text)
}

// Decimal non-negative integers in the canonical spelling: "0", or digits without a leading zero.
function decodeSequence<K extends SequenceKey>(
  key: K,
  text: unknown,
): Outcome<Identity<K>, ModelIdentityRejection<K>> {
  if (typeof text !== 'string') return reject(key, 'type')
  if (text.length === 0) return reject(key, 'empty')
  if (text.length > MODEL_IDENTITY_MAX_LENGTH) return reject(key, 'length')
  if (!SEQUENCE_TEXT.test(text)) return reject(key, 'character')
  if (text.length > 1 && text.startsWith('0')) return reject(key, 'leading-zero')
  return succeed(mintIdentity<K>(text))
}

export function decodeRevision(
  text: unknown,
): Outcome<Revision, ModelIdentityRejection<'ModelRevision'>> {
  return decodeSequence('ModelRevision', text)
}

export function decodeOutputCursor(
  text: unknown,
): Outcome<OutputCursor, ModelIdentityRejection<'ModelOutputCursor'>> {
  return decodeSequence('ModelOutputCursor', text)
}

// Canonical spelling has no leading zero, so a longer text is a larger number and texts of equal
// length order by their digits. No number conversion, so no precision limit.
function compareSequences(left: string, right: string): -1 | 0 | 1 {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function compareRevisions(left: Revision, right: Revision): -1 | 0 | 1 {
  return compareSequences(left, right)
}

export function compareOutputCursors(left: OutputCursor, right: OutputCursor): -1 | 0 | 1 {
  return compareSequences(left, right)
}
