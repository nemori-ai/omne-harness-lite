import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { MaintenanceHandle, SessionInstance } from '@omne-harness/session'
import { describe, type Diagnose } from './diagnostics.ts'

export type Scanners = Readonly<{
  bind(tenant: TenantId): void
  releaseAll(): Promise<readonly string[]>
}>

export function createScanners(
  input: Readonly<{
    instance: SessionInstance<unknown>
    removing(): boolean
    diagnose: Diagnose
  }>,
): Scanners {
  const { instance, removing, diagnose } = input
  const handles = new Map<string, MaintenanceHandle>()

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
