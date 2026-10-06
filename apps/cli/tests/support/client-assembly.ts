import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import type { AssemblyCloseReport } from '@omne-harness-lite/assembly-lifecycle'
import {
  ClientAssemblyStopped,
  type ClientAssembly,
  type ClientAssemblyOptions,
} from '../../src/client-assembly.ts'

/** Control tests retain their original state/client faults. Real assembly tests use Cordis. */
export function fixtureAssembly<S extends { close(): Promise<void> }>(
  options: ClientAssemblyOptions,
  openState: (options: ClientAssemblyOptions) => Promise<S>,
  createClient: (options: { state: S }) => GovernanceClientOperations,
): ClientAssembly {
  let state: S | undefined, client: GovernanceClientOperations | undefined
  let stopping = false
  const stopped = Promise.withResolvers<void>()
  const presentation = Promise.withResolvers<void>()
  void stopped.promise.catch(() => undefined)
  const ready = Promise.resolve().then(async () => {
    state = await openState(options)
    if (stopping) throw new ClientAssemblyStopped()
    client = createClient({ state })
    return client
  })
  const closed: Promise<AssemblyCloseReport> = stopped.promise.then(
    async () => {
      await presentation.promise
      try {
        await state?.close()
        return { complete: true, assemblyErrors: [], rows: [] }
      } catch {
        return {
          complete: false,
          assemblyErrors: [],
          rows: [{ id: 'localState', result: { kind: 'failed', codes: ['close'] } }],
        }
      }
    },
    () => new Promise<AssemblyCloseReport>(() => {}),
  )
  return {
    ready,
    requestStop() {
      if (stopping) return
      stopping = true
      void ready
        .catch(() => undefined)
        .then(() => client?.close())
        .then(stopped.resolve, stopped.reject)
    },
    clientStopped: stopped.promise,
    releasePresentation: () => presentation.resolve(),
    closed,
  }
}
