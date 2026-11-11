import { afterEach, expect, it } from 'vitest'
import {
  commandDigest,
  type SessionCheckedAccess,
  type SessionCommand,
  type SessionPermissionWriteQualification,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  sessionId,
  memoryOtherAccess,
} from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})
async function world() {
  const bound: SessionCheckedAccess<string>[] = []
  const h = await harness({
    backend: {
      name: 'observed public delegation',
      async open(check) {
        const backend = await memoryBackend.open(check)
        return {
          ...backend,
          delegated: {
            bind(checked) {
              bound.push(checked)
              return backend.delegated.bind(checked)
            },
          },
        }
      },
    },
  })
  open.push(h)
  await h.create()
  bound.length = 0
  const command = {
    kind: 'change',
    input: {
      tenant: h.access().tenant,
      session: h.access().session,
      operation: operationId('permission-write'),
      declaration: {
        kind: 'permission-assignment',
        capabilityId: 'schedule',
        enforcementKey: 'create',
        definition: {
          origin: { kind: 'independent', providerId: 'schedule', definitionRef: 'v1' },
          itemId: 'create',
          revision: '1',
        },
        rule: { pick: 'deny', allowedSet: null },
        expectedRevision: '0',
        authorization: evidence('expression'),
      },
    },
  } satisfies SessionCommand
  const qualification: SessionPermissionWriteQualification = {
    tenant: command.input.tenant,
    session: command.input.session,
    operation: command.input.operation,
    commandDigest: commandDigest(command),
    permissionRevision: '0',
    principalRef: 'original-principal',
    policy: evidence('trusted-policy'),
  }
  const change = () =>
    h.faces('intake').management.change({
      ...h.access(),
      operation: command.input.operation,
      declaration: command.input.declaration,
    })
  return { h, bound, qualification, change }
}

it('does not bind a permission write from an ordinary allowed decision', async () => {
  const w = await world()
  w.h.checks.script({ kind: 'allowed', evidence: evidence('ordinary-allow') })
  expect(await w.change()).toMatchObject({ failure: { kind: 'denied' } })
  expect(w.bound).toHaveLength(0)
})

it('carries the original qualification to the public delegated port without creating a new authority', async () => {
  const w = await world()
  w.h.checks.script({
    kind: 'allowed',
    evidence: evidence('access'),
    writeQualification: w.qualification,
  })
  // This memory backend has no protected writer; the test proves only the service handoff.
  expect(await w.change()).toMatchObject({ failure: { kind: 'denied' } })
  expect(w.bound).toHaveLength(1)
  expect(w.bound[0]?.writeQualification).toEqual(w.qualification)
})

it.each([
  'tenant',
  'operation',
  'session',
  'commandDigest',
  'permissionRevision',
  'principalRef',
] as const)('rejects a qualification with another %s before binding storage', async field => {
  const w = await world()
  const qualification = {
    ...w.qualification,
    ...(field === 'tenant' ? { tenant: memoryOtherAccess('other-tenant').tenant } : {}),
    ...(field === 'operation' ? { operation: operationId('another-operation') } : {}),
    ...(field === 'session' ? { session: sessionId('another-session') } : {}),
    ...(field === 'commandDigest' ? { commandDigest: '0'.repeat(64) } : {}),
    ...(field === 'permissionRevision' ? { permissionRevision: '1' } : {}),
    ...(field === 'principalRef' ? { principalRef: '' } : {}),
  }
  w.h.checks.script({
    kind: 'allowed',
    evidence: evidence('access'),
    writeQualification: qualification,
  })
  expect(await w.change()).toMatchObject({ failure: { kind: 'denied' } })
  expect(w.bound).toHaveLength(0)
})
