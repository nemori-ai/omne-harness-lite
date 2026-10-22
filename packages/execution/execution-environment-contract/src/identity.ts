import type { TenantId } from '@omne-harness/legal-identity'

/** Opaque identity of the original call that resources and adoption records hang on. */
export type OriginRef = string & { readonly __origin: unique symbol }

/** Idempotency key the caller gives to one acquisition. */
export type AcquisitionRef = string & { readonly __acquisition: unique symbol }

/** Access identity: the environment only passes the principal on; it neither compares nor interprets it. */
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>

function isOriginText(text: string): text is OriginRef {
  return text.length > 0
}

function isAcquisitionText(text: string): text is AcquisitionRef {
  return text.length > 0
}

/** Accepts a non-empty string as an origin reference. Throws `TypeError` on an empty string. */
export function originRef(text: string): OriginRef {
  if (!isOriginText(text)) throw new TypeError('An origin reference must be a non-empty string')
  return text
}

/** Accepts a non-empty string as an acquisition key. Throws `TypeError` on an empty string. */
export function acquisitionRef(text: string): AcquisitionRef {
  if (!isAcquisitionText(text))
    throw new TypeError('An acquisition reference must be a non-empty string')
  return text
}
