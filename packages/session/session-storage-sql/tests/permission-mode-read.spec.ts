import { expect, it } from 'vitest'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'

function read(a: App, tenant = TENANT_A, session = 'session-1') {
  return a.provider.storage.read({
    domain: a.directory.entries[0]!.domain,
    requestKey: 'permission-mode-test',
    handler: 'session.permission-mode',
    protocol: '1',
    input: { tenant: textOf(tenant), session },
  })
}

it('reads mode provenance without a permission item and preserves the original creation basis', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  const original = await a.bindings.read({ tenant: TENANT_A, session: a.access(TENANT_A).session })
  if ('failure' in original || original.ok.kind !== 'bound') throw new Error('not bound')
  expect(await read(a)).toMatchObject({
    kind: 'read',
    output: {
      kind: 'current',
      revision: '0',
      creationSource: original.ok.source,
    },
  })
  expect(
    await a.port.commit({
      access: a.access(TENANT_A),
      guards: [],
      command: {
        kind: 'change',
        input: {
          tenant: TENANT_A,
          session: a.access(TENANT_A).session,
          operation: operationId('mode-after-creation'),
          declaration: {
            kind: 'permission-mode',
            value: 'never',
            authorization: evidence('fixture-mode'),
          },
        },
      },
    }),
  ).toHaveProperty('ok')
  const changed = await read(a)
  expect(changed).toMatchObject({
    kind: 'read',
    output: {
      kind: 'current',
      revision: '1',
      creationSource: original.ok.source,
      mode: { override: { value: 'never' } },
    },
  })
  if (changed.kind !== 'read' || typeof changed.output !== 'object' || changed.output === null)
    throw new Error('not read')
  expect(changed.output).not.toHaveProperty('assignment')
  expect(changed.output).not.toHaveProperty('capabilityId')
  expect(changed.output).not.toHaveProperty('source', original.ok.source)
})

it('does not reveal another tenant or an unknown Session as ready', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  expect(await read(a, TENANT_B)).toMatchObject({ kind: 'read', output: { kind: 'not-ready' } })
  expect(await read(a, TENANT_A, 'missing')).toMatchObject({
    kind: 'read',
    output: { kind: 'not-ready' },
  })
})
