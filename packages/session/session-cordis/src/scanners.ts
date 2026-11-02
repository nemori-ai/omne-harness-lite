// One recovery scanner for each tenant (SPEC property 7). The first version keeps this guarantee
// by installing one copy of the plugin in the assembly (IC-19), so this table is the only
// bookkeeping: it binds a scanner the first time a notice names a tenant, and it releases all of
// them at removal. The table is derived data; after a reload it is built again from new notices.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { MaintenanceHandle, SessionInstance } from '@omne-harness/session'
import { describe, type Diagnose } from './diagnostics.ts'

export type Scanners = Readonly<{
  /** Starts a scanner for `tenant` unless it has one or is getting one. Never throws, never waits. */
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
  const binding = new Set<string>()

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

  const start = async (tenant: TenantId, key: string): Promise<void> => {
    try {
      const started = await instance.maintain(tenant)
      if ('failure' in started) {
        // The tenant stays out of the table; the next notice of the tenant tries again.
        diagnose(`maintain for tenant ${key} answered ${JSON.stringify(started.failure)}`)
        return
      }
      if (removing()) await release(started.ok, key)
      else handles.set(key, started.ok)
    } catch (error) {
      diagnose(`maintain for tenant ${key} threw: ${describe(error)}`)
    } finally {
      binding.delete(key)
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
      const key = encoded.value
      if (handles.has(key) || binding.has(key)) return
      binding.add(key)
      void start(tenant, key)
    },
    releaseAll: async () => {
      const held = [...handles.entries()]
      handles.clear()
      const problems = await Promise.all(held.map(([key, handle]) => release(handle, key)))
      return problems.filter((problem): problem is string => problem !== null)
    },
  }
}
