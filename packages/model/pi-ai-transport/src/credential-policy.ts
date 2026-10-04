import {
  createCredentialRedactionPolicy,
  type BoundCredentialRedaction,
  type CredentialRedactionConfig,
} from '@omne-harness-lite/model-request-runtime-local'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import { object } from './json.ts'

/** Validate with the sole policy authority, then retain an independent immutable configuration. */
export function ownCredentialConfiguration(
  config: CredentialRedactionConfig,
): CredentialRedactionConfig {
  createCredentialRedactionPolicy(config)
  const owned = structuredClone(config)
  // Validate the exact owned value before publishing resources; never reread the source later.
  createCredentialRedactionPolicy(owned)
  return Object.freeze({
    credential_fragment_min_length: owned.credential_fragment_min_length,
    credential_header_names: Object.freeze(owned.credential_header_names),
    credential_patterns: Object.freeze(
      owned.credential_patterns.map(pattern => Object.freeze(pattern)),
    ),
  })
}

/** Only pure processing calls are translated into fixed local stage failures. */
export class CredentialProcessingFailure extends Error {
  constructor(
    readonly stage: string,
    readonly rejected: boolean,
  ) {
    super(stage)
  }
}
export function processedText(
  bound: BoundCredentialRedaction,
  value: string,
  stage: string,
): string {
  let result
  try {
    result = bound.text(value)
  } catch {
    throw new CredentialProcessingFailure(stage, false)
  }
  if ('rejected' in result) throw new CredentialProcessingFailure(stage, true)
  return result.ok
}
export function processedObject(
  bound: BoundCredentialRedaction,
  value: JsonObject,
  stage: string,
): JsonObject {
  let result
  try {
    result = bound.json(value)
  } catch {
    throw new CredentialProcessingFailure(stage, false)
  }
  if ('rejected' in result || !object(result.ok)) throw new CredentialProcessingFailure(stage, true)
  return result.ok
}
