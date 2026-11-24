import {
  enabledExtensionsDescriptor,
  type EnabledExtensionsViews,
} from '@omne-harness/loop-extension-contract'
import type { StaticBlock } from '@omne-harness/runtime-context-contract'

/** The block of the tenant-level scope. It keeps no value: every read asks the view of the tenant. */
export function enabledExtensionsBlock<P>(views: EnabledExtensionsViews<P>): StaticBlock<P> {
  return Object.freeze({
    declaration: enabledExtensionsDescriptor,
    async supply({ tenant, principal }) {
      const read = await views.read({ principal, tenant })
      return read.kind === 'view' ? { kind: 'value', value: read.view } : { kind: 'unavailable' }
    },
  })
}
