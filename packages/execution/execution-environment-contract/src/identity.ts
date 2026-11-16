export type OriginRef = string & { readonly __origin: unique symbol }

export type AcquisitionRef = string & { readonly __acquisition: unique symbol }

export type { Access } from '@omne-harness/legal-identity'

function isOriginText(text: string): text is OriginRef {
  return text.length > 0
}

function isAcquisitionText(text: string): text is AcquisitionRef {
  return text.length > 0
}

export function originRef(text: string): OriginRef {
  if (!isOriginText(text)) throw new TypeError('An origin reference must be a non-empty string')
  return text
}

export function acquisitionRef(text: string): AcquisitionRef {
  if (!isAcquisitionText(text))
    throw new TypeError('An acquisition reference must be a non-empty string')
  return text
}
