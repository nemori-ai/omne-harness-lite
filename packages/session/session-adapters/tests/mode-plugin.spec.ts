import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { adoption, evidence, operationId } from '@omne-harness/session-contract/testing'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { RuntimeContextService } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { SessionScopeLookupService } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionModesPlugin, sessionInquiryBinding } from '../src/cordis.ts'
import { cordisScene, sqlScene } from './fixtures/sql-scene.ts'
import { ok } from './fixtures/common-journal.ts'

it('publishes original Session mode changes through a coordinator Cordis fiber and withdraws on disposal', async () => {
  const scene = await sqlScene('mode-plugin')
  const context = await cordisScene(scene)
  const work = ok(await scene.port.readWork(scene.sessionAccess))
  const binding = work.contextScopes?.find(binding => binding.ended === null)
  if (binding === undefined) throw new Error('Session has no open context scope')
  const generation = binding.generation
  const scope = ok(decodeScopeRef({ ref: binding.scope }))
  const trust = createTestAuthorityPorts<unknown>()
  trust.bind(scope, work.tenant)
  const runtime = createRuntimeContext({
    trust: { authority: trust.authority, bindings: trust.bindings },
  })
  class Runtime extends RuntimeContextService<unknown> {
    readonly registerProducer = runtime.registerProducer
    readonly prepareRegistration = runtime.prepareRegistration
    readonly issueEligibility = runtime.issueEligibility
    readonly revokeEligibility = runtime.revokeEligibility
    readonly applyCommit = runtime.applyCommit
    readonly beginReplay = runtime.beginReplay
    readonly finishReplay = runtime.finishReplay
    readonly bind = runtime.bind
  }
  class Scopes extends SessionScopeLookupService {
    readonly lookup = async () => ({
      kind: 'known' as const,
      tenant: work.tenant,
      session: work.session,
      generation,
    })
  }
  try {
    await context.mount(Runtime)
    await context.mount(Scopes)
    const producer = createSessionModesPlugin({
      tenant: work.tenant,
      principal: scene.sessionAccess.principal,
      coordinator: async () => succeed(scene.sessionAccess.principal),
      defaultModes: async () =>
        succeed({
          modes: {
            permission: 'auto_permission',
            collaboration: 'co-work',
            environment: adoption('environment'),
          },
          basis: evidence('tenant-defaults'),
        }),
    })
    const plugin = await context.mount(producer)
    const begun = await runtime.beginReplay('holder', {
      scope,
      tenant: work.tenant,
      through: null,
      supersedes: null,
    })
    if (begun.kind !== 'replaying') throw new Error(JSON.stringify(begun))
    expect(
      await runtime.finishReplay('holder', {
        replay: begun.replay,
        material: { registrations: [], checkpoints: [], end: null },
      }),
    ).toHaveProperty('kind', 'ready')
    expect(
      await runtime.applyCommit('holder', {
        kind: 'registration',
        commit: { commit: 'initial-modes' },
        after: null,
        change: {
          kind: 'add',
          creating: true,
          scope,
          tenant: work.tenant,
          key: 'session.modes',
          basedOn: 0,
          required: true,
          parameters: undefined,
          bindings: [sessionInquiryBinding],
        },
      }),
    ).toHaveProperty('kind', 'applied')
    async function notify(kinds: string[]) {
      const current = ok(await scene.port.readWork(scene.sessionAccess))
      await context.ctx.parallel(
        'session-cordis-contract/committed',
        current.tenant,
        current.session,
        current.revision,
        current.source,
        kinds,
      )
    }
    await notify(['session.context-registration-changed'])
    const need = { need: sessionInquiryBinding.need.name, key: sessionInquiryBinding.key }
    const issued = await runtime.issueEligibility('holder', {
      supersedes: null,
      scope,
      tenant: work.tenant,
      principal: scene.sessionAccess.principal,
      consumer: 'coordinator',
      keys: [],
      bindings: [need],
      registrationRevision: 1,
    })
    if (issued.kind !== 'issued') throw new Error(JSON.stringify(issued))
    const bound = await runtime.bind(issued.eligibility.id)
    if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
    expect(await bound.reader.read([need])).toMatchObject({
      kind: 'success',
      value: [
        {
          value: {
            inquiry: { policy: { onAsk: 'ask-human' } },
            basis: { permissionRevision: '0' },
          },
        },
      ],
    })
    expect(
      await scene.port.commit({
        access: scene.sessionAccess,
        guards: [],
        command: {
          kind: 'change',
          input: {
            tenant: work.tenant,
            session: work.session,
            operation: operationId('deny-mode'),
            declaration: {
              kind: 'permission-mode',
              value: 'never',
              authorization: evidence('mode-change'),
            },
          },
        },
      }),
    ).toHaveProperty('ok')
    await notify(['session.mode-changed'])
    expect(await bound.reader.read([need])).toMatchObject({
      kind: 'success',
      value: [
        {
          value: {
            inquiry: { policy: { onAsk: 'deny' } },
            basis: { permissionRevision: '1' },
          },
        },
      ],
    })
    await context.ctx.parallel(
      'session-cordis-contract/committed',
      work.tenant,
      work.session,
      work.revision,
      work.source,
      ['session.mode-changed'],
    )
    expect(await bound.reader.read([need])).toMatchObject({
      kind: 'success',
      value: [
        {
          value: {
            inquiry: { policy: { onAsk: 'deny' } },
            basis: { permissionRevision: '1' },
          },
        },
      ],
    })
    expect(
      await scene.port.commit({
        access: scene.sessionAccess,
        guards: [],
        command: {
          kind: 'change',
          input: {
            tenant: work.tenant,
            session: work.session,
            operation: operationId('auto-mode'),
            declaration: {
              kind: 'permission-mode',
              value: 'auto_permission',
              authorization: evidence('mode-change'),
            },
          },
        },
      }),
    ).toHaveProperty('ok')
    expect(await producer.refresh(work.session)).toEqual({ kind: 'refreshed' })
    expect(await bound.reader.read([need])).toMatchObject({
      kind: 'success',
      value: [
        {
          value: {
            inquiry: { policy: { onAsk: 'ask-human' } },
            basis: { permissionRevision: '2' },
          },
        },
      ],
    })
    await notify(['session.permission-assigned'])
    await plugin.dispose()
    expect(await bound.reader.read([need])).toHaveProperty('kind', 'missing')
    expect(await producer.refresh(work.session)).toEqual({ kind: 'unavailable' })
  } finally {
    await context.dispose()
    await runtime.close()
    await scene.close()
  }
})
