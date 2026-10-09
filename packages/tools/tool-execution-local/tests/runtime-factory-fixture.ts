import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import { unwrap } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type {
  ToolRuntimeConfig,
  ToolRuntimeDependencies,
  ToolRuntimeInstance,
} from '@omne-harness-lite/tool-execution-runtime'
import { createToolImplementationRegistry, createToolRuntime } from '../src/index.ts'
import { at } from './execution-owner-fixture.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'

export function factoryConfig(): ToolRuntimeConfig {
  return {
    frameQueueBytes: 0,
    resultStorage: 'factory-results',
    tailRetry: { attempts: 2, minDelayMs: 0, maxDelayMs: 0 },
  }
}

/** Actual root factory and SQL log; authority and unused live ports are controlled. */
export async function factoryFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-tool-factory-'))
  const log = await openSqlLogFixture({ dir })
  const recovery = Object.freeze({}) as RecoveryAccess
  const release = vi.fn(async () => {})
  const borrow = vi.fn(() => ({ log, release }))
  const enumerate = vi.fn<ToolRuntimeDependencies['owner']['enumerate']>(async () => ({
    kind: 'sessions',
    sessions: [],
  }))
  const authorize = vi.fn<ToolRuntimeDependencies['authorization']['authorize']>(async () => ({
    kind: 'rejected',
    reason: 'notAuthorized',
  }))
  const unused = vi.fn((): never => {
    throw new Error('factory test invoked an unused live port')
  })
  const dependencies: ToolRuntimeDependencies = {
    recovery,
    backing: { ownerGeneration: 'factory-owner', borrow },
    owner: { enumerate, readPrefix: unused, borrow: unused },
    history: { inspect: () => ({ kind: 'notFound' }) },
    authorization: { authorize },
    admission: () => undefined,
    implementations: createToolImplementationRegistry(),
    context: { bind: unused },
    environments: {
      recover: unused,
      recoverOwned: unused,
      resolvePlacement: unused,
      acquire: unused,
    },
    results: {
      bindWriter: unused,
      available: unused,
      readResult: unused,
      readBytes: unused,
      readForDelivery: unused,
      readDeliveryBytes: unused,
    },
    runnerHost: { acquireDispatch: unused, acquireReplay: unused },
    invoke: unused,
    clock: { now: async () => unwrap(instantFromRfc3339(at)) },
  }
  let runtime: ToolRuntimeInstance | undefined
  return {
    log,
    dependencies,
    recovery,
    release,
    borrow,
    enumerate,
    authorize,
    unused,
    start(supplied: unknown): ToolRuntimeInstance {
      if (runtime !== undefined) throw new Error('one original factory per fixture')
      const created: ToolRuntimeInstance = Reflect.apply(createToolRuntime, undefined, [
        supplied,
        dependencies,
      ])
      runtime = created
      return created
    },
    async close() {
      if (runtime !== undefined) await runtime.close()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
