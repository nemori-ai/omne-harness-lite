import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { vi } from 'vitest'
import {
  parseTenantId,
  parseOpaqueIdentifier,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations, type Storage } from '@omne-harness-lite/storage'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type {
  AccessIdentity,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type {
  ContextConsumer,
  ContextRegistration,
  ContextSource,
  ContextSessionSeed,
} from '@omne-harness-lite/runtime-context'
import { createRuntimeContext, runtimeContextMigrations } from '../src/index.ts'
const tenant = parseTenantId({ organization: 'org', account: 'alice' }),
  session = parseOpaqueIdentifier('session', 'SessionRef')
if (!('ok' in tenant) || !('ok' in session)) throw new Error('fixture invalid')
export const scope: SessionScope = { tenant: tenant.ok, session: session.ok }
export const at = '2026-10-04T00:00:00Z'
export const identityRegistration: ContextRegistration = {
  key: 'identity',
  source: 'session',
  config: null,
  consumers: ['model', 'tool', 'extension'],
  required: true,
  recovery: 'persisted',
}
export const seed: ContextSessionSeed = {
  required: [identityRegistration],
  initial: [
    {
      key: 'identity',
      revision: 'initial',
      observedAt: at,
      value: { tenant: { ...scope.tenant }, session: scope.session },
    },
  ],
  fixed: [{ key: 'identity', value: { tenant: { ...scope.tenant }, session: scope.session } }],
}
export function authority() {
  const bindings = new Map<SessionAccess, AccessIdentity>()
  const operations: SessionAccessOperations = {
    authorize: vi.fn<SessionAccessOperations['authorize']>(async (access, requested) => {
      const identity = bindings.get(access)
      return identity &&
        tenantIdEquals(requested.tenant, identity.scope.tenant) &&
        requested.session === identity.scope.session
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' }
    }),
  }
  return {
    operations,
    bind(consumer: AccessIdentity['consumer'], keys: readonly string[], boundScope = scope) {
      // Test authority oracle; product issuance is covered separately with real Cordis generations.
      const token = Object.freeze({}) as SessionAccess
      bindings.set(token, {
        binding: 'fixture',
        principal: 'fixture',
        principalKind: 'system',
        scope: boundScope,
        consumer,
        contextKeys: keys,
      })
      return token
    },
    setKeys(token: SessionAccess, keys: readonly string[]) {
      const prior = bindings.get(token)
      if (!prior) throw new Error('binding missing')
      bindings.set(token, { ...prior, contextKeys: [...keys] })
    },
    revoke(token: SessionAccess) {
      bindings.delete(token)
    },
  }
}
export function source(
  name = 'session',
  recovery: ContextSource['recovery'] = 'persisted',
): ContextSource {
  return {
    name,
    recovery,
    consumers: ['model', 'tool', 'extension'],
    requiredKeys: name === 'session' ? ['identity'] : [],
    read: async () => ({ kind: 'values', values: [] }),
  }
}
export async function host(
  now: Parameters<typeof createRuntimeContext>[0]['now'] = async () => at,
  wrapStorage: (storage: Storage) => Storage = storage => storage,
) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-context-')),
    log = await openSqlLogFixture({ dir: dir })
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'context.sqlite'),
    migrations: composeMigrations(runtimeContextMigrations),
    upgrade: false,
  })
  const auth = authority()
  const observedLog = { ...log, readSince: vi.fn(log.readSince) }
  const owner = createRuntimeContext({
    log: observedLog,
    storage: wrapStorage(storage),
    access: auth.operations,
    now,
  })
  const initializer = { ...owner.initializer, drain: owner.drain }
  const access = auth.bind('coordinator', ['identity', 'public', 'secret'])
  const publisher = auth.bind('source', ['identity', 'public', 'secret'])
  const tool = auth.bind('tool', ['identity', 'public', 'secret'])
  const disposeSource = owner.sources.registerSource(source())
  return {
    dir,
    storage,
    log,
    observedLog,
    auth,
    initializer,
    owner,
    access,
    publisher,
    tool,
    disposeSource,
    async close() {
      owner.closeAdmission()
      await owner.drain()
      await initializer.drain()
      await log.close()
      await storage.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
export async function init(h: Awaited<ReturnType<typeof host>>) {
  const result = await h.initializer.initializeContextSession(scope, seed)
  if (result.kind !== 'applied') throw new Error('init failed')
  return result.revision
}
export async function reader(
  h: Awaited<ReturnType<typeof host>>,
  token = h.tool,
  consumer: ContextConsumer = 'tool',
) {
  const bound = await h.owner.operations.bind(token, scope, consumer)
  if (bound.kind !== 'bound') throw new Error('binding failed')
  return bound.reader
}
