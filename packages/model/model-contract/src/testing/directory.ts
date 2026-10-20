import { referenceRejected } from './reference.ts'
import type { ModelReferenceAccess } from '../root.ts'
import { resolveModelInvocationRef } from '../reference.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import type { LiveRoute, ModelDirectory, Reply } from '../index.ts'
import { denied, openCall, type Core } from './core.ts'
import { handleFor } from './observation.ts'

export function createDirectory<P>(core: Core<P>): ModelDirectory<P> {
  async function connect(original: ModelReferenceAccess<P>): Reply<LiveRoute<P>> {
    const resolved = resolveModelInvocationRef(original.reference, original.tenant)
    if ('failure' in resolved) return referenceRejected(resolved.failure, 'connect')
    const input = { principal: original.principal, ...resolved.ok }
    if (core.state.directoryDown)
      return fail({
        kind: 'unavailable',
        dependency: 'model-directory',
        diagnostic: 'the directory of live routes cannot be reached',
      })
    const record = openCall(core, input, 'connect')
    if (record === null) return denied('connect')
    if (record.instance === null) return succeed<LiveRoute<P>>({ kind: 'no-live-route' })
    return succeed<LiveRoute<P>>({ kind: 'live', handle: handleFor(core, record, record.instance) })
  }
  return { connect }
}
