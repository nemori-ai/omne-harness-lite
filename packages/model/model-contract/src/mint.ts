// The one place that turns checked text into a branded identity. It is not exported from the
// package entry: the decoders of this package import it, nothing else does.
import type { Identity } from './root.ts'

export function mintIdentity<K extends string>(text: string): Identity<K> {
  // brand-mint: the decoder that calls this has already checked the text.
  return text as Identity<K>
}
