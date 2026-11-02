// The conversion result reader for a deployment that takes no media input. It answers that no
// block has a conversion: an index without entries. It never makes a conversion up, so a media
// block the model cannot take stays without an accepted representation.
import { tenantEquals } from '@omne-harness/legal-identity'
import type { ConversionResultSource } from '@omne-harness/request-context-contract'

export function createAbsentConversionResults<P>(): ConversionResultSource<P> {
  return {
    async read({ access, target }) {
      if (!tenantEquals(access.tenant, target.tenant)) return { kind: 'denied' }
      return { kind: 'index', entries: new Map() }
    },
  }
}
