// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import {
  SESSION_PERMISSION_MODE_HANDLER,
  decodeSessionPermissionMode,
} from '../src/participants.ts'
import { openRealApp, TENANT_A, textOf, type RealApp } from './fixtures/real-provider.ts'

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0).reverse()) await app.dispose()
})

async function read(app: RealApp) {
  const result = await app.storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
      transactionDomain: app.domainOf(TENANT_A),
    },
    requestKey: 'mode-provenance',
    handler: SESSION_PERMISSION_MODE_HANDLER,
    protocol: '1',
    input: { tenant: textOf(TENANT_A), session: 'session-1' },
  })
  if (result.kind !== 'read') throw new Error(JSON.stringify(result))
  const mode = decodeSessionPermissionMode(result.output)
  if (mode === 'malformed' || mode.kind !== 'current') throw new Error(JSON.stringify(mode))
  return mode
}

it('retains original creation evidence through a mode change and real Worker reopen', async () => {
  const app = await openRealApp()
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  const original = await read(app)
  expect(original.revision).toBe('0')
  expect(original.creationSource).toEqual(original.source)

  expect(
    await app.port.commit({
      access: app.access(TENANT_A),
      guards: [],
      command: {
        kind: 'change',
        input: {
          tenant: TENANT_A,
          session: app.access(TENANT_A).session,
          operation: operationId('changed-mode-before-reopen'),
          declaration: {
            kind: 'permission-mode',
            value: 'never',
            authorization: evidence('mode-policy-fixture'),
          },
        },
      },
    }),
  ).toHaveProperty('ok')
  const current = await read(app)
  expect(current.revision).toBe('1')
  expect(current.creationSource).toEqual(original.creationSource)
  expect(current.source).not.toEqual(original.source)
  expect(current.mode.override?.value).toBe('never')

  expect(await app.close()).toHaveProperty('kind', 'closed')
  const reopened = await openRealApp({ root: app.root })
  apps.push(reopened)
  expect(await read(reopened)).toEqual(current)
}, 60_000)
