// The scripted provider builds the identities it owns (revisions, cursors, read ids) through the
// package decoders, so no brand is made by an assertion. Every text built here is a decimal
// number, which the decoders always accept.
import type { Outcome } from '@omne-harness/operation-result'
import { decodeOutputCursor, decodeReadId, decodeRevision } from '../identity-values.ts'
import type { OutputCursor, ReadId, Revision } from '../root.ts'
import { ScriptedModelError } from './error.ts'

function valueOf<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new ScriptedModelError('invalid-script', 'an identity built by the provider was rejected')
}

export function mintRevision(sequence: number): Revision {
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    throw new ScriptedModelError('invalid-script', 'revision limit')
  return valueOf(decodeRevision(String(sequence)))
}

export function mintCursor(sequence: number): OutputCursor {
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    throw new ScriptedModelError('invalid-script', 'cursor limit')
  return valueOf(decodeOutputCursor(String(sequence)))
}

export function mintRead(sequence: number): ReadId {
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    throw new ScriptedModelError('invalid-script', 'read limit')
  return valueOf(decodeReadId(`mread_scripted${sequence}`))
}
