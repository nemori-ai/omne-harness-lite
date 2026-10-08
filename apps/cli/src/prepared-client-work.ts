import { createClientAssembly } from './assembly.ts'
import {
  assemblyCloseDiagnostics,
  type ClientAssemblyOptions,
  type PreparedClientAssembly,
} from './client-assembly.ts'
import type { Diagnostic } from './diagnostic.ts'

export type PreparedFactory = (options: ClientAssemblyOptions) => PreparedClientAssembly

/** Own the assembly. Keep its state alive until the original client is quiescent. */
export async function usingPreparedClient<T>(
  options: ClientAssemblyOptions,
  signal: AbortSignal,
  work: (assembly: PreparedClientAssembly) => Promise<T>,
  factory: PreparedFactory = createClientAssembly,
): Promise<{ outcome: T; diagnostics: readonly Diagnostic[] }> {
  const assembly = factory(options)
  const stop = () => assembly.requestStop()
  signal.addEventListener('abort', stop)
  if (signal.aborted) stop()
  let outcome: T | undefined,
    failure: unknown,
    failed = false
  let cleanup: Awaited<ReturnType<typeof stopPreparedClient>>
  try {
    outcome = await work(assembly)
  } catch (error) {
    failed = true
    failure = error
  } finally {
    cleanup = await stopPreparedClient(assembly)
    signal.removeEventListener('abort', stop)
  }
  if (failed) {
    if (cleanup.failures.length)
      throw new AggregateError([failure, ...cleanup.failures], 'entry work and cleanup failed')
    throw failure
  }
  return { outcome: outcome!, diagnostics: cleanup.diagnostics }
}

async function stopPreparedClient(
  assembly: PreparedClientAssembly,
): Promise<{ diagnostics: Diagnostic[]; failures: unknown[] }> {
  assembly.requestStop()
  try {
    await assembly.clientStopped
  } catch (error) {
    return { diagnostics: ['client-close-failed'], failures: [error] }
  }
  assembly.releasePresentation()
  try {
    const report = await assembly.closed
    const diagnostics = [...assemblyCloseDiagnostics(report)]
    return {
      diagnostics,
      failures: diagnostics.length ? [new Error('entry assembly cleanup failed')] : [],
    }
  } catch (error) {
    return { diagnostics: ['internal-defect'], failures: [error] }
  }
}
