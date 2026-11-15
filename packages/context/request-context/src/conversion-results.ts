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
