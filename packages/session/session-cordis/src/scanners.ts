// One recovery scanner for each tenant (SPEC property 7). The first version keeps this guarantee
// by installing one copy of the plugin in the assembly (IC-19), so this table is the only
// bookkeeping. Every notice of a tenant calls `maintain` once: it is the demand signal of the
// scanner, which starts one when the tenant has none (session SPEC「扫描者的生灭」). A scanner that
// stops because its tenant has no work leaves the table; removal releases the rest. The table is
// derived data; after a reload it is built again from new notices.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { MaintenanceHandle, SessionInstance } from '@omne-harness/session'
import { describe, type Diagnose } from './diagnostics.ts'

export type Scanners = Readonly<{
  /** Signals demand for the scanner of `tenant`, which starts one if needed. Never throws, never waits. */
  bind(tenant: TenantId): void
  /**
   * Releases every scanner and returns what went wrong, one text each. A failure is recorded and
   * does not stop the others. A scanner that arrives later releases itself.
   */
  releaseAll(): Promise<readonly string[]>
}>

export function createScanners(
  input: Readonly<{
    instance: SessionInstance<unknown>
    /** True from the first step of removal: no new scanner may stay. */
    removing(): boolean
    diagnose: Diagnose
  }>,
): Scanners {
  const { instance, removing, diagnose } = input
  const handles = new Map<string, MaintenanceHandle>()

  /** The problem text of a failed release, or null. */
  const release = async (handle: MaintenanceHandle, tenant: string): Promise<string | null> => {
    try {
      await handle.release()
      return null
    } catch (error) {
      const problem = `releasing the scanner of tenant ${tenant} failed: ${describe(error)}`
      diagnose(problem)
      return problem
    }
  }

  const signal = async (tenant: TenantId, key: string): Promise<void> => {
    try {
      const started = await instance.maintain(tenant)
      if ('failure' in started) {
        // Only a closed instance answers a failure; it starts no scanner.
        diagnose(`maintain for tenant ${key} answered ${JSON.stringify(started.failure)}`)
        return
      }
      const handle = started.ok
      if (removing()) {
        await release(handle, key)
        return
      }
      if (handles.get(key) === handle) return
      handles.set(key, handle)
      void handle.ended.then(() => {
        if (handles.get(key) === handle) handles.delete(key)
      })
    } catch (error) {
      diagnose(`maintain for tenant ${key} threw: ${describe(error)}`)
    }
  }

  return {
    bind: tenant => {
      if (removing()) return
      const encoded = tenantCodec.encode(tenant)
      if (!encoded.ok) {
        diagnose('a notice named a tenant that legal-identity did not mint; no scanner is bound')
        return
      }
      void signal(tenant, encoded.value)
    },
    releaseAll: async () => {
      const held = [...handles.entries()]
      handles.clear()
      const problems = await Promise.all(held.map(([key, handle]) => release(handle, key)))
      return problems.filter((problem): problem is string => problem !== null)
    },
  }
}
