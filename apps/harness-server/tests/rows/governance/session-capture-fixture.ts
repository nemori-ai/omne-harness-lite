import { createSessionModesPublication } from '@omne-harness/session-adapters'
import { sessionInquiryBinding } from '@omne-harness/session-adapters/cordis'
import { decodeSessionPermissionMode } from '@omne-harness/session-storage-sql/participants'
import { createSessionStorage } from '@omne-harness/session-storage-sql'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import {
  creation,
  adoption,
  ordinaryInput,
  evidence,
  sessionId,
  operationId,
  initializationFixtureGuard,
  initializationFixtureFacts,
  adoptedInitializationFixture,
} from '@omne-harness/session-contract/testing'
import type { SessionCommand } from '@omne-harness/session-contract'
import type { settingsPreparationWorld } from './settings-preparation-world.ts'

/** Actual Session writer; initialization and write authority are named fixtures, not production admission. */
export async function createCaptureSession(
  w: Pick<
    Awaited<ReturnType<typeof settingsPreparationWorld>>,
    'register' | 'scope' | 'domain' | 'storage' | 'principal'
  >,
) {
  const combination = await w.register('capture-session', [...SESSION_LOG_PARTICIPANTS])
  const entry = { tenant: w.scope.tenantRef, domain: w.domain }
  const port = createSessionStorage({
    storage: w.storage,
    combination,
    domains: {
      resolve: async () => ({ kind: 'ready', entry }),
      snapshot: async () => ({ kind: 'ready', value: { revision: '1', entries: [entry] } }),
    },
    accessCheck: {
      check: async () => ({ kind: 'allowed', evidence: evidence('capture-session-fixture') }),
    },
    cursorSigning: createFixedSessionCursorSigning(),
  })
  const access = {
    principal: w.principal,
    tenant: w.principal.tenant,
    session: sessionId('owner-session'),
  }
  const command: SessionCommand = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('capture-session-create'),
      creation: creation({ initial: ordinaryInput('input-1') }),
    },
  }
  const created = await port.commit({
    access,
    command,
    guards: [
      initializationFixtureGuard(
        initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
      ),
    ],
  })
  if ('failure' in created) throw new Error(JSON.stringify(created))
  return {
    access,
    port,
    combination,
    async publishInquiry() {
      const work = await port.readWork(access)
      if ('failure' in work) throw new Error('No Session work')
      const read = await w.storage.read({
        domain: w.domain,
        handler: 'session.permission-mode',
        protocol: '1',
        requestKey: 'capture-publication',
        input: { tenant: w.scope.tenantRef, session: access.session },
      })
      if (read.kind !== 'read') throw new Error('No Session mode')
      const permission = decodeSessionPermissionMode(read.output)
      if (permission === 'malformed' || permission.kind !== 'current')
        throw new Error('No current mode')
      const result = createSessionModesPublication({
        work: work.ok,
        permission,
        defaults: {
          kind: 'available',
          adoption: adoption('tenant-defaults'),
          modes: {
            permission: 'auto_permission',
            collaboration: 'co-work',
            environment: adoption('environment'),
          },
          source: evidence('capture-default-mode-fixture'),
        },
      })
      if (result.kind !== 'ready') throw new Error(JSON.stringify(result))
      return sessionInquiryBinding.translate(result.value)
    },
    async changeMode() {
      return port.commit({
        access,
        guards: [],
        command: {
          kind: 'change',
          input: {
            tenant: access.tenant,
            session: access.session,
            operation: operationId('capture-session-mode'),
            declaration: {
              kind: 'permission-mode',
              value: 'never',
              authorization: evidence('capture-mode-fixture'),
            },
          },
        },
      })
    },
  }
}
