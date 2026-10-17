// The one place that turns checked text into a branded identity. It is not exported from the
// package entry: the decoders and the guard derivation of this package import it, nothing else
// does.
import type { Identity, ModelIdentityKey } from './root.ts'

export function mintIdentity<K extends ModelIdentityKey>(text: string): Identity<K> {
  // brand-mint: the caller has already checked the text or built it by a fixed rule.
  return text as Identity<K>
}
