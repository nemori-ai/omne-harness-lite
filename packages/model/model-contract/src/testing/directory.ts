import { fail, succeed } from '@omne-harness/operation-result'
import type { LiveRoute, ModelDirectory, Reply } from '../index.ts'
import type { CallAccess } from '../root.ts'
import { denied, openCall, type Core } from './core.ts'
import { handleFor } from './observation.ts'

export function createDirectory<P>(core: Core<P>): ModelDirectory<P> {
  async function connect(input: CallAccess<P>): Reply<LiveRoute<P>> {
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
