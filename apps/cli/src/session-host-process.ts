import { join } from 'node:path'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { tenantPaths } from './state-layout.ts'
import { openCliCatalog } from './catalog-open.ts'
import { usingSelectedTenant } from './selected-tenant-work.ts'
import { startProductionSessionHost } from './session-production-root.ts'
import { FileSessionRuntimeFailure } from './session-file-root.ts'
import { parseRunLoginBinding } from './session-preparation.ts'
import type { SessionHostStartup } from './session-host-startup.ts'
import type { SessionRuntimeRoot } from './session-runtime-root-types.ts'

export interface SessionHostProcessIO {
  /** Each call consumes a distinct stop request. No new request means no cleanup retry. */
  readonly stopRequested: () => Promise<void>
  readonly diagnostic: (error: unknown) => void
}

/** Own the governance assembly for the lifetime of the actual independent Session host. */
export async function runSessionHostProcess(
  startup: SessionHostStartup,
  io: SessionHostProcessIO,
): Promise<void> {
  const catalog = await openCliCatalog(startup.home, {
    maxCenters: 256,
    maxCreations: 100_000,
    maxRecordBytes: 1_048_576,
  })
  try {
    const result = await usingSelectedTenant(
      startup.home,
      catalog.catalog,
      new AbortController().signal,
      async ports => {
        if (
          ports.selection.selected.centerId !== startup.binding.centerId ||
          !tenantIdEquals(ports.selection.selected.tenant, startup.binding.tenant)
        )
          throw new Error('Session host startup no longer matches the selected tenant')
        const read = await ports.source.read()
        if (read.kind !== 'read' || !read.snapshot.value?.login)
          throw new Error('Session host login unavailable')
        const current = read.snapshot.value
        const source = parseRunLoginBinding({
          centerId: current.center.centerId,
          accountId: current.login!.accountId,
          loginStateHandle: current.login!.handle,
        })
        if (!source) throw new Error('Session host login identity invalid')
        let root: SessionRuntimeRoot
        try {
          root = await startProductionSessionHost({
            home: startup.home,
            binding: startup.binding,
            source,
            governance: ports.client,
            routeName: startup.routeName,
            keyFile: join(
              tenantPaths(startup.home, startup.binding).credentials,
              'model-replica.key',
            ),
            diagnostic: io.diagnostic,
          })
        } catch (error) {
          if (error instanceof FileSessionRuntimeFailure) {
            io.diagnostic(error)
            await closeOnRequest(error.closeRetained, io)
          }
          throw error
        }
        await io.stopRequested()
        await closeOnRequest(root.close, io, true)
        return { stopped: true }
      },
    )
    if (result.diagnostics.length || !('stopped' in result.outcome))
      throw new Error('Session host identity preparation or cleanup failed')
  } finally {
    await catalog.close()
  }
}

async function closeOnRequest(
  close: SessionRuntimeRoot['close'],
  io: SessionHostProcessIO,
  requested = false,
): Promise<void> {
  for (;;) {
    if (!requested) await io.stopRequested()
    requested = false
    try {
      if ('closed' in (await close())) return
      io.diagnostic(new Error('Session host shutdown retains original resources'))
    } catch (error) {
      io.diagnostic(error)
    }
  }
}
