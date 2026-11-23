import { canonicalText } from '../../src/rows/agent-adoptions/definition-mappings.ts'
import { decide } from '@omne-harness/session-contract'
import { contextInitialization } from '../../src/assembly/session-context-initialization.ts'
import { AdoptionSourcesImpl } from '../../src/rows/adoption-sources/sources.ts'
import { agentAdoptionsConfig } from '../../src/rows/agent-adoptions/config.ts'
import { tableMappings } from '../../src/rows/agent-adoptions/held-definitions.ts'
import { buildTable } from '../../src/rows/agent-adoptions/table.ts'
import { createCommand, mappingConfig, plainOf } from '../rows/adoptions/support.ts'
import { Service, type Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { createRuntimeContextPlugin } from '@omne-harness/runtime-context-cordis/cordis'
import { runtimeContextTrustKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { sessionModesDescriptor, sessionModesProducer } from '@omne-harness/session-adapters/cordis'
import {
  sessionModesPrincipals,
  sessionModesPrincipalsKey,
} from '../../src/entry/session-modes-principals.ts'
import { createRuntimeContextTrustModule } from '../../src/entry/runtime-context-trust.ts'
import { SessionModesInstallation } from '../../src/rows/session-ad03/modes.ts'
import { dispatchPrincipalOf, verifierOf } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, got } from './support.ts'

it('mounts one real producer per tenant through the production authority and withdraws with its fiber', async () => {
  const fixture = fixtureEnv([sessionModesPrincipalsKey, runtimeContextTrustKey])
  try {
    await fixture.install(sessionModesPrincipals)
    await fixture.install(createRuntimeContextTrustModule())
    await fixture.scopeOf(runtimeContextTrustKey).plugin(createRuntimeContextPlugin())
    for (const key of ['session', 'sessionScopeLookup', 'storage', 'tenantDomainLookup']) {
      await fixture.root.plugin({
        name: `registration-only-${key}`,
        apply(ctx: Context) {
          new (class extends Service {})(ctx, key)
        },
      })
    }
    await fixture.root.plugin({
      name: 'new-session-binding-source',
      apply(ctx: Context) {
        class Principals extends Service {
          readonly forSession = async () => ({
            failure: { kind: 'denied' as const, action: 'forSession' },
          })
          constructor(ctx: Context) {
            super(ctx, 'sessionWorkPrincipals')
          }
        }
        new Principals(ctx)
      },
    })
    const principals = got(
      fixture.scopeOf(sessionModesPrincipalsKey).get(sessionModesPrincipalsKey),
      'principals',
    )
    let installation: SessionModesInstallation | undefined
    const fiber = await fixture.root.plugin({
      name: 'modes-installation',
      apply(ctx: Context) {
        installation = new SessionModesInstallation(ctx, {
          recoverSession: async () => ({ kind: 'unavailable' }),
          principals,
          verifier: verifierOf(fixture.env),
          coordinator: async () => ({
            failure: { kind: 'unavailable', owner: 'test', diagnostic: 'registration only' },
          }),
          defaultModes: async () => ({
            failure: { kind: 'unavailable', diagnostic: 'registration only' },
          }),
        })
      },
    })
    const runtime = fixture.root.runtimeContext
    const registrations = vi.spyOn(runtime, 'registerProducer')
    const modes = got(installation, 'installation')
    const tenant = fixtureTenant('a')
    const answers = await Promise.all([
      modes.ensure(tenant),
      modes.ensure(tenant),
      modes.ensure(fixtureTenant('b')),
    ])
    expect(answers).toEqual([{ kind: 'ready' }, { kind: 'ready' }, { kind: 'ready' }])
    expect(registrations).toHaveBeenCalledTimes(2)
    const original = createCommand('alpha')
    const input = { ...original.input, tenant, principal: principals.forTenant(tenant) }
    const initial = contextInitialization(input)
    expect(contextInitialization(input)).toEqual(initial)
    expect(initial.blocks.map(item => item.block.item)).toEqual([
      'session.modes',
      'session.working-directory',
    ])
    const command = {
      ...original,
      input: {
        ...original.input,
        tenant,
        creation: {
          ...original.input.creation,
          initialization: initial.initialization,
        },
      },
    }
    const table = await buildTable(agentAdoptionsConfig.parse(mappingConfig()))
    const source = new AdoptionSourcesImpl(fixture.root, tableMappings(table))
    const access = { tenant, session: input.session, principal: input.principal }
    const guarded = await source.prepare(command, access)
    expect(guarded).toHaveProperty('ok')
    if ('failure' in guarded) throw new Error(JSON.stringify(guarded.failure))
    const decision = decide(null, command, guarded.ok, null, { compaction: null })
    expect(decision).toHaveProperty('kind', 'entries')
    if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
    const created = decision.entries.find(entry => entry.kind === 'session.created')
    if (created === undefined) throw new Error('missing creation')
    const createdBody = plainOf(created.payload) as Record<string, unknown>
    const adoption = createdBody['initialAdoption'] as Record<string, unknown>
    const capabilitiesMaterial = adoption['capabilities'] as Record<string, unknown>
    const capabilities = plainOf(capabilitiesMaterial['value']) as Record<string, unknown>
    expect(capabilities['contextPreparations']).toEqual(
      initial.blocks.map(item => canonicalText(item.preparation)),
    )
    const registered = decision.entries
      .filter(entry => entry.kind === 'session.context-registration-changed')
      .map(entry => (plainOf(entry.payload) as { initialization: unknown }).initialization)
    expect(registered).toMatchObject(
      initial.blocks.map(item => ({ decision: item.preparation.decision })),
    )
    const outcomes = decision.entries.filter(entry => entry.kind === 'session.initialization-item')
    expect(outcomes.map(entry => plainOf(entry.payload))).toMatchObject(
      initial.blocks.map(item => ({ outcome: item.outcome })),
    )
    expect(
      await modes.prepareInitial(
        { ...input, principal: structuredClone(input.principal) },
        initial.blocks[0]!.block,
      ),
    ).toHaveProperty('failure')
    const part = dispatchPrincipalOf(fixture.env)
    const asPart = (principal: unknown) =>
      modes.prepareInitial({ ...input, principal }, initial.blocks[0]!.block)
    expect(await asPart(part)).toHaveProperty('ok')
    expect(await asPart(structuredClone(part))).toHaveProperty('failure')
    // A verified principal that acts for another tenant is not a system part: it prepares as itself and is refused.
    expect(await asPart(principals.forTenant(fixtureTenant('b')))).toHaveProperty('failure')
    const tampered = {
      ...command,
      input: {
        ...command.input,
        creation: {
          ...command.input.creation,
          initialization: { ...initial.initialization, results: [] },
        },
      },
    }
    expect(await source.prepare(tampered, access)).toMatchObject({ failure: { kind: 'invalid' } })

    const duplicate = () =>
      runtime.registerProducer(principals.forTenant(tenant), {
        key: 'session.modes',
        tenant,
        producer: sessionModesProducer,
        declaration: sessionModesDescriptor,
        scoped: true,
        supply: async () => ({ kind: 'none' }),
      })
    await fiber.dispose()
    expect(await modes.ensure(tenant)).toEqual({ kind: 'unavailable' })
    // Without the installation, or without the caller's access, no block can be prepared.
    const down = { failure: { kind: 'unavailable', owner: 'session.context' } }
    expect(await source.prepare(command, access)).toMatchObject(down)
    expect(await source.prepare(command, undefined)).toMatchObject(down)
    const replacement = await duplicate()
    expect(replacement).toMatchObject({ kind: 'registered' })
    if (replacement.kind === 'registered') await replacement.handle.dispose()
  } finally {
    await fixture.root.fiber.dispose()
  }
})
