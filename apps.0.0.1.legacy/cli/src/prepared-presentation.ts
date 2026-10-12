import type { PreparedClientAssembly } from './client-assembly.ts'
import { assemblyCloseDiagnostics } from './client-assembly.ts'
import type { Diagnostic } from './diagnostic.ts'

export interface PresentationCleanup {
  readonly diagnostics: readonly Diagnostic[]
  readonly failures: readonly unknown[]
}
export interface PreparedPresentation {
  own(assembly: PreparedClientAssembly): void
  quiescent(assembly: PreparedClientAssembly): void
}
/** The terminal owner retains actual CLS release gates until presentation ends. */
export class PreparedPresentationGroup implements PreparedPresentation {
  readonly #assemblies = new Map<PreparedClientAssembly, boolean>()
  own(assembly: PreparedClientAssembly): void {
    if (this.#assemblies.has(assembly)) throw new Error('assembly already owned')
    this.#assemblies.set(assembly, false)
  }
  quiescent(assembly: PreparedClientAssembly): void {
    if (!this.#assemblies.has(assembly)) throw new Error('assembly not owned')
    this.#assemblies.set(assembly, true)
  }
  get isQuiescent(): boolean {
    return [...this.#assemblies.values()].every(value => value)
  }
  async release(): Promise<PresentationCleanup> {
    if (!this.isQuiescent) throw new Error('original clients not quiescent')
    const diagnostics: Diagnostic[] = [],
      failures: unknown[] = []
    for (const assembly of this.#assemblies.keys()) {
      const result = await releaseAssembly(assembly)
      diagnostics.push(...result.diagnostics)
      failures.push(...result.failures)
    }
    return { diagnostics, failures }
  }
}
async function releaseAssembly(assembly: PreparedClientAssembly): Promise<PresentationCleanup> {
  try {
    assembly.releasePresentation()
    const diagnostics = assemblyCloseDiagnostics(await assembly.closed)
    return {
      diagnostics,
      failures: diagnostics.length ? [new Error('presentation assembly close failed')] : [],
    }
  } catch (error) {
    return { diagnostics: ['internal-defect'], failures: [error] }
  }
}
