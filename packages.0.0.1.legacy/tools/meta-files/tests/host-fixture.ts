import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createHostEnvironment } from '@omne-harness-lite/execution-environments-host'
import { hostEnvironmentMigrations } from '@omne-harness-lite/execution-environments-host/migrations'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { parseTenantId, parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { ResourceLifecycle } from '@omne-harness-lite/execution-environments'
import type { InvocationDependencies } from '@omne-harness-lite/tool-execution-runtime'
import { FILES_CONTEXT_KEY } from '../src/index.ts'

/** Real provider, with a visible test-only lifecycle ledger. The demo verifies durable runtime ownership. */
export async function hostFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'omne-files-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'storage.sqlite'),
    migrations: composeMigrations(hostEnvironmentMigrations),
    upgrade: false,
  })
  const scope = {
    tenant: unwrap(parseTenantId({ organization: 'files-tests', account: 'owner' })),
    session: unwrap(parseOpaqueIdentifier('files-session', 'SessionRef')),
  }
  const authorization = {} as SessionAccess
  const access: SessionAccessOperations = {
    authorize: async candidate =>
      candidate === authorization
        ? {
            kind: 'authorized',
            identity: {
              binding: 'fixture-only',
              principal: 'owner',
              principalKind: 'human',
              scope,
              consumer: 'tool',
              contextKeys: [FILES_CONTEXT_KEY],
            },
          }
        : { kind: 'rejected', reason: 'notAuthorized' },
  }
  const provider = createHostEnvironment({ name: 'files-real-host', access, storage })
  const events: { kind: string; key: string }[] = []
  async function acquire() {
    const call = {
      tool: { name: 'Files', definition: 'files-fixture' },
      execution: unwrap(parseOpaqueIdentifier(randomUUID(), 'CallId')),
    }
    const controller = new AbortController()
    const resources: ResourceLifecycle = {
      closed: controller.signal,
      plan: async value => {
        events.push({ kind: 'plan', key: value.key })
        return 'recorded'
      },
      permit: async key => {
        if (!events.some(item => item.kind === 'plan' && item.key === key))
          throw new Error('Missing resource plan')
        events.push({ kind: 'permit', key })
        return 'confirmed'
      },
      adopt: async key => {
        if (!events.some(item => item.kind === 'permit' && item.key === key))
          throw new Error('Missing resource permit')
        events.push({ kind: 'adopt', key })
        return 'confirmed'
      },
      stopped: async (key, status) => {
        events.push({ kind: status, key })
        return 'recorded'
      },
    }
    const requirement = { bindingLayer: 'host_machine' as const, facilities: ['files'] }
    const result = await provider.acquire({
      scope,
      authorization,
      call,
      requirement,
      placement: {
        scope,
        ...call,
        requirement,
        permission: 'always-allow',
        revision: 'fixture',
        evidence: null,
      },
      resources,
    })
    if (result.kind !== 'acquired') throw new Error(`Host acquire rejected: ${result.reason}`)
    const deps: InvocationDependencies = {
      context: {
        read: async keys => ({
          kind: 'values',
          values: keys.map(key => ({
            key,
            revision: 'fixture',
            value: {
              cwd: directory,
              envs: { PATH: '/usr/bin:/bin', TERM: 'dumb', SHELL_NOTE: 'initial' },
            },
            observedAt: '2026-10-07T00:00:00Z',
          })),
        }),
      },
      environment: result.lease.facilities,
      signal: controller.signal,
      wait: async () => ({ kind: 'rejected', reason: 'notAllowed' }),
      frames: {
        emit: () => {
          throw new Error('Files must not emit')
        },
      },
      costs: { report: async () => 'recorded' },
    }
    return { deps, lease: result.lease, controller }
  }
  return {
    directory,
    acquire,
    events,
    async close() {
      const result = await provider.retire()
      if (result.kind !== 'drained')
        throw new Error('Real host retained resources; do not remove its directory')
      await storage.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
