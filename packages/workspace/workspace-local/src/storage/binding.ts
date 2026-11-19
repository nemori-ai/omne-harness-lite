import type { SqlStorage } from '@omne-harness/sql-contract'
import { DOMAIN, PARTICIPANT } from './schema.ts'
import type { WorkspaceBinding } from './store.ts'

export type DomainBindingPorts = Readonly<{
  storage: Pick<SqlStorage, 'registerCombination'>
  /** The combination of the running code. Asked when the domain is first used. */
  combination(): Promise<WorkspaceBinding>
  /** Told why there is no binding: callers only see an unavailable basis. */
  report(reason: string): void
}>

/** Registers the workspace domain once and remembers the binding. A failure is asked again next time. */
export function createDomainBinding(
  ports: DomainBindingPorts,
): () => Promise<WorkspaceBinding | null> {
  let bound: Promise<WorkspaceBinding | null> | undefined

  async function open(): Promise<WorkspaceBinding | null> {
    const combination = await ports.combination()
    const registered = await ports.storage.registerCombination({
      ...DOMAIN,
      ...combination,
      participants: [PARTICIPANT],
    })
    if (registered.kind === 'registered') return combination
    ports.report(`the storage answered ${registered.kind}`)
    return null
  }

  return () => {
    if (bound !== undefined) return bound
    const opening = open()
      .catch((error: unknown) => {
        ports.report(String(error))
        return null
      })
      .then(binding => {
        if (binding === null) bound = undefined
        return binding
      })
    bound = opening
    return opening
  }
}
