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
} from '@omne-harness-lite/tool-execution-runtime'
import { createToolImplementationRegistry } from '../src/index.ts'
import { at } from './execution-owner-fixture.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import type {
  SessionLogBackingOperations,
  SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import type { ToolActionHistoryOperations } from '@omne-harness-lite/tool-admission'
import type { RunnerServiceHost } from '@omne-harness-lite/loop-extension-runner'

type FixtureDependencies = ToolRuntimeDependencies & {
  readonly backing: SessionLogBackingOperations
  readonly owner: SessionLogOwnerOperations
  readonly history: ToolActionHistoryOperations
  readonly runnerHost: RunnerServiceHost
}

export function factoryConfig(): ToolRuntimeConfig {
  return {
    frameQueueBytes: 0,
    resultStorage: 'factory-results',
    tailRetry: { attempts: 2, minDelayMs: 0, maxDelayMs: 0 },
  }
}

/** Actual SQL log and controlled construction dependencies. */
export async function factoryFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-tool-factory-'))
  const log = await openSqlLogFixture({ dir })
  const recovery = Object.freeze({}) as RecoveryAccess
  const release = vi.fn(async () => {})
  const borrow = vi.fn(() => ({ log, release }))
  const enumerate = vi.fn<FixtureDependencies['owner']['enumerate']>(async () => ({
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
  const dependencies: FixtureDependencies = {
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
  return {
    dir,
    log,
    dependencies,
    recovery,
    release,
    borrow,
    enumerate,
    authorize,
    unused,
    async close() {
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
