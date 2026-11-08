import { afterEach, expect, it } from 'vitest'
import { adoption, evidence, operationId } from '@omne-harness/session-contract/testing'
import { decodeSessionPermissionMode } from '@omne-harness/session-storage-sql/participants'
import {
  createSessionModesPublication,
  SESSION_MODES_PUBLICATION,
  type SessionModesPublicationInput,
} from '../src/index.ts'
import { sessionInquiryBinding, sessionModesDescriptor } from '../src/cordis.ts'
import { ok } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const scene of scenes.splice(0)) await scene.close()
})

async function fixture() {
  const scene = await sqlScene('mode-publication')
  scenes.push(scene)
  const input = await observe(scene)
  return { scene, input }
}

async function observe(scene: SqlScene): Promise<SessionModesPublicationInput> {
  const work = ok(await scene.port.readWork(scene.sessionAccess))
  const result = await scene.storage.read({
    domain: scene.domain,
    handler: 'session.permission-mode',
    protocol: '1',
    requestKey: 'publication-mode',
    input: { tenant: scene.domain.scope.tenant, session: work.session },
  })
  if (result.kind !== 'read') throw new Error(JSON.stringify(result))
  const permission = decodeSessionPermissionMode(result.output)
  if (permission === 'malformed' || permission.kind !== 'current') throw new Error('no mode')
  return {
    work,
    permission,
    defaults: {
      kind: 'available',
      adoption: adoption('tenant-defaults'),
      modes: {
        permission: 'auto_permission',
        collaboration: 'co-work',
        environment: adoption('environment'),
      },
      source: evidence('default-mode-source'),
    },
  }
}

async function change(scene: SqlScene, value: 'never' | 'auto_permission') {
  return scene.port.commit({
    access: scene.sessionAccess,
    guards: [],
    command: {
      kind: 'change',
      input: {
        tenant: scene.sessionAccess.tenant,
        session: scene.sessionAccess.session,
        operation: operationId(`mode-${value}`),
        declaration: { kind: 'permission-mode', value, authorization: evidence('mode-change') },
      },
    },
  })
}

it('keeps an old inquiry paired with its old basis when a newer mode is observed', async () => {
  const { scene, input } = await fixture()
  const first = createSessionModesPublication(input)
  expect(first.kind).toBe('ready')
  if (first.kind !== 'ready') throw new Error('not ready')
  expect(await change(scene, 'never')).toHaveProperty('ok')
  const latest = await observe(scene)
  expect(createSessionModesPublication({ ...latest, work: input.work })).toEqual({
    kind: 'unavailable',
    reason: 'permission-revision-mismatch',
  })
  expect(createSessionModesPublication({ ...input, work: latest.work })).toEqual({
    kind: 'unavailable',
    reason: 'permission-revision-mismatch',
  })
  const second = createSessionModesPublication(latest)
  expect(second).toMatchObject({ kind: 'ready', value: { inquiry: { policy: { onAsk: 'deny' } } } })
  expect(first.value.inquiry.policy.onAsk).toBe('ask-human')
  const selected = sessionInquiryBinding.translate(first.value)
  expect(selected.inquiry).toEqual(first.value.inquiry)
  expect(selected.basis).toEqual(first.value.basis)
  expect(selected.basis.permissionRevision).toBe(input.permission.revision)
  expect(selected.basis.permissionRevision).not.toBe(latest.permission.revision)
})

it('preserves source evidence and serializes one versioned immutable publication', async () => {
  const { input } = await fixture()
  const result = createSessionModesPublication(input)
  if (result.kind !== 'ready') throw new Error('not ready')
  expect(result.value.basis).toMatchObject({
    tenant: input.permission.tenant,
    session: input.work.session,
    sessionRevision: input.work.revision,
    permissionRevision: input.permission.revision,
    permissionSource: input.permission.source,
  })
  expect(SESSION_MODES_PUBLICATION.owner).toBe('@omne-harness/session-adapters')
  expect(SESSION_MODES_PUBLICATION.digest).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(
    await sessionModesDescriptor.schema['~standard'].validate(
      JSON.parse(JSON.stringify(result.value)),
    ),
  ).toHaveProperty('value', result.value)
  expect(Object.isFrozen(result.value)).toBe(true)
  expect(Object.isFrozen(result.value.basis.permissionSource)).toBe(true)
  expect(Object.isFrozen(result.value.modes.environment)).toBe(true)
})

it.each(['tenant', 'session'] as const)(
  'rejects a different %s in the owner observation',
  async field => {
    const { input } = await fixture()
    expect(
      createSessionModesPublication({
        ...input,
        permission: { ...input.permission, [field]: 'other' },
      }),
    ).toEqual({ kind: 'unavailable', reason: 'scope-mismatch' })
  },
)

it('does not replace an unavailable or different original default with a new one', async () => {
  const { input } = await fixture()
  expect(createSessionModesPublication({ ...input, defaults: { kind: 'unavailable' } })).toEqual({
    kind: 'unavailable',
    reason: 'default-mode-missing',
  })
  if (input.defaults.kind !== 'available') throw new Error('no defaults')
  expect(
    createSessionModesPublication({
      ...input,
      defaults: { ...input.defaults, adoption: adoption('different-default') },
    }),
  ).toEqual({ kind: 'unavailable', reason: 'default-mode-mismatch' })
})

it('rejects a partial or malformed publication at the Runtime Context boundary', async () => {
  const { input } = await fixture()
  const result = createSessionModesPublication(input)
  if (result.kind !== 'ready') throw new Error('not ready')
  const validate = sessionModesDescriptor.schema['~standard'].validate
  expect(
    createSessionModesPublication({
      ...input,
      permission: {
        ...input.permission,
        source: { ...input.permission.source, digest: '' },
      },
    }),
  ).toEqual({ kind: 'unavailable', reason: 'invalid-source-material' })
  expect(await validate(result.value.modes)).toHaveProperty('issues')
  expect(
    await validate({ ...result.value, basis: { ...result.value.basis, permissionRevision: '-1' } }),
  ).toHaveProperty('issues')
})

it('uses the latest environment and collaboration changes with the owner permission override', async () => {
  const { input } = await fixture()
  const environment = adoption('new-environment')
  const result = createSessionModesPublication({
    ...input,
    defaults: { kind: 'unavailable' },
    permission: {
      ...input.permission,
      mode: {
        ...input.permission.mode,
        override: { value: 'never', source: evidence('override') },
      },
    },
    work: {
      ...input.work,
      changes: [
        {
          kind: 'collaboration-mode',
          value: 'co-work',
          authorization: evidence('old-collaboration'),
        },
        {
          kind: 'collaboration-mode',
          value: 'auto-drive',
          authorization: evidence('new-collaboration'),
        },
        {
          kind: 'environment-mode',
          value: environment,
          authorization: evidence('environment'),
          setting: evidence('setting'),
        },
      ],
    },
  })
  expect(result).toMatchObject({
    kind: 'ready',
    value: {
      modes: { permission: 'never', collaboration: 'auto-drive', environment },
      inquiry: { policy: { onAsk: 'deny' }, source: evidence('override') },
    },
  })
})

it('uses explicit creation without defaults and detaches caller-owned source objects', async () => {
  const { input } = await fixture()
  const source = { ...input.permission.source }
  const environment = { ...adoption('explicit-environment') }
  const result = createSessionModesPublication({
    ...input,
    defaults: { kind: 'unavailable' },
    permission: {
      ...input.permission,
      source,
      mode: {
        adopted: {
          kind: 'explicit',
          value: {
            permission: 'auto_permission',
            collaboration: 'co-work',
            environment,
          },
        },
        override: null,
      },
    },
  })
  if (result.kind !== 'ready') throw new Error('not ready')
  const copied = JSON.parse(JSON.stringify(result.value))
  source.record = 'mutated'
  environment.name = 'mutated'
  expect(result.value).toEqual(copied)
  expect(result.value.inquiry.source).toEqual(input.permission.creationSource)
})
